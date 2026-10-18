package br.gov.ro.lume.lume_navegador

import android.Manifest
import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import java.util.concurrent.atomic.AtomicLong

/** Explicit, main-thread opt-in. Recognition audio and text never enter the incident outbox. */
class VoiceTrigger private constructor(private val context: Context) {
    private val preferences = context.getSharedPreferences("voice_trigger", Context.MODE_PRIVATE)
    private val handler = Handler(Looper.getMainLooper())
    private val generation = AtomicLong()
    private val engine = VoiceAudioEngine(context)
    private val modelAvailable by lazy { VoiceAudioEngine.modelAvailable(context) }
    private val controller get() = ProtectionController.get(context)
    private val keyguard get() = context.getSystemService(KeyguardManager::class.java)
    @Volatile private var enabled = false
    @Volatile private var listening = false
    @Volatile private var trainingUntil = 0L
    @Volatile private var trainingResult = "idle"
    @Volatile private var message: String? = null
    @Volatile private var confirmation = false
    private var expectedIdentity: String? = null
    private var policy: VoicePhrasePolicy? = null
    private var lastUnlockedAt = 0L
    private var firstPhraseAt = 0L
    private var observingUnlock = false
    private val unlockReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action != Intent.ACTION_USER_PRESENT) return
            lastUnlockedAt = now()
            if (trainingUntil != 0L) {
                policy?.reset(); confirmation = false; firstPhraseAt = 0L
                trainingResult = "unlocked"; signal()
            }
        }
    }

    private fun now() = SystemClock.elapsedRealtime()
    private fun environment(): String = "voice-v1:${BuildConfig.VERSION_CODE}:${Build.FINGERPRINT}:" +
        Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)
    private fun phraseId() = preferences.getString("phraseId", "estrela_azul") ?: "estrela_azul"
    private fun proofValue(): String = "${environment()}:${phraseId()}:${controller.deviceIdentity()}"
    private fun trained() = keyguard.isDeviceSecure && preferences.getString("lockedProof", null) == proofValue()
    private fun cooldown(): Long = if (preferences.getString("cooldownEnvironment", null) == environment())
        (preferences.getLong("cooldownUntil", 0L) - now()).coerceAtLeast(0) else 0

    // Read by the upload executor too: no recorder/recognizer mutations or lifecycle callbacks here.
    fun status(): Map<String, Any?> {
        val expired = trainingUntil != 0L && now() >= trainingUntil
        return mapOf(
            "voiceAvailable" to modelAvailable,
            "voiceEnabled" to enabled,
            "voiceListening" to listening,
            "voiceReady" to (enabled && listening && trainingUntil == 0L && trained() && eligible() && cooldown() == 0L),
            "voiceTrainedLocked" to trained(),
            "voiceTraining" to if (expired) "expired" else trainingResult,
            "voicePhraseId" to phraseId(),
            "voiceError" to message,
            "voiceCooldownSeconds" to ((cooldown() + 999) / 1_000),
            "voiceConfirmationPending" to confirmation,
        )
    }

    private fun eligible(): Boolean = controller.armed && controller.deviceIdentity() != null &&
        controller.canRunLocationSession() && controller.consentAudio() &&
        controller.hasPermission(Manifest.permission.RECORD_AUDIO) && !controller.sharingPaused() &&
        controller.eventId() == null && ProtectionService.current?.microphoneSessionAvailable() == true

    private fun prerequisites() {
        check(modelAvailable) { "O modelo de voz não está instalado neste APK. Solicite a versão completa à equipe." }
        check(eligible()) { "Vincule o aparelho, autorize o áudio e ative a sessão no aplicativo antes de usar a frase." }
        check(keyguard.isDeviceSecure) { "Configure PIN, senha ou biometria no bloqueio do aparelho antes do treino." }
        check(PhysicalTrigger.get(context).status()["physicalTraining"] !in setOf("waiting", "unlocked")) {
            "Termine ou cancele o treino dos botões antes do treino por voz."
        }
    }

    /** Called only after the currently resumed Activity has obtained a separate voice consent. */
    fun beginTraining(id: String, consent: Boolean) {
        check(consent) { "Autorize a escuta local antes de iniciar o treino." }
        require(VoicePhrasePolicy.PHRASES.containsKey(id)) { "Escolha uma das frases disponíveis." }
        prerequisites()
        disable()
        check(preferences.edit().putString("phraseId", id).remove("lockedProof").commit()) {
            "Não foi possível preparar o treino com segurança."
        }
        expectedIdentity = controller.deviceIdentity()
        policy = VoicePhrasePolicy(id)
        trainingUntil = now() + 90_000L
        trainingResult = "loading"
        lastUnlockedAt = now()
        startCapture()
    }

    fun cancelTraining() { if (trainingUntil != 0L) disable() }

    fun enable(consent: Boolean) {
        check(consent) { "Confirme que deseja habilitar o acionamento real por frase." }
        prerequisites()
        check(trainingUntil == 0L && trained()) { "Conclua o treino com o celular bloqueado antes de habilitar." }
        check(cooldown() == 0L) { "Aguarde o intervalo de segurança antes de habilitar novamente." }
        disable()
        expectedIdentity = controller.deviceIdentity()
        policy = VoicePhrasePolicy(phraseId())
        enabled = true // In memory only. Process death/reboot never authorizes microphone capture.
        startCapture()
    }

    private fun startCapture() {
        val epoch = generation.incrementAndGet()
        message = null
        if (!observingUnlock) {
            val filter = IntentFilter(Intent.ACTION_USER_PRESENT)
            if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(unlockReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            else context.registerReceiver(unlockReceiver, filter)
            observingUnlock = true
        }
        handler.post(monitor)
        try {
            engine.start(
                onReady = {
                    if (generation.get() == epoch && eligible() && expectedIdentity == controller.deviceIdentity()) {
                        listening = true
                        if (trainingUntil != 0L) trainingResult = "waiting"
                        signal()
                    } else if (generation.get() == epoch) fail("A sessão mudou. Reabra o app e habilite a frase novamente.")
                },
                onUtterance = { utterance -> if (generation.get() == epoch) accept(utterance) },
                onError = { error -> if (generation.get() == epoch) fail(error) },
            )
        } catch (_: Exception) { fail("Não foi possível iniciar a escuta local. Reabra o aplicativo para conferir.") }
        signal()
    }

    private val monitor = object : Runnable {
        override fun run() {
            if (!enabled && trainingUntil == 0L) return
            if (!keyguard.isKeyguardLocked || !keyguard.isDeviceSecure) {
                lastUnlockedAt = now()
                if (trainingUntil != 0L && confirmation) { policy?.reset(); confirmation = false; firstPhraseAt = 0L }
            }
            if (!eligible() || expectedIdentity != controller.deviceIdentity()) {
                fail("A escuta parou porque a sessão ou as permissões mudaram. Reative pelo aplicativo.")
                return
            }
            if (trainingUntil != 0L && now() >= trainingUntil) {
                disable()
                trainingResult = "expired"
                signal()
                return
            }
            if (confirmation && now() - firstPhraseAt > 12_000L) {
                policy?.reset(); confirmation = false; firstPhraseAt = 0L; signal()
            }
            handler.postDelayed(this, 250)
        }
    }

    private fun accept(utterance: VoiceUtterance) {
        if (!listening || !eligible() || expectedIdentity != controller.deviceIdentity()) {
            fail("A sessão mudou. Reabra o app e habilite a frase novamente.")
            return
        }
        val training = trainingUntil != 0L
        if (training && now() >= trainingUntil) {
            disable(); trainingResult = "expired"; signal(); return
        }
        if (training && (!keyguard.isKeyguardLocked || !keyguard.isDeviceSecure || utterance.startElapsedMs <= lastUnlockedAt)) {
            policy?.reset(); confirmation = false; firstPhraseAt = 0L
            trainingResult = "unlocked"; signal(); return
        }
        when (policy?.accept(utterance, now())) {
            VoiceDecision.AWAITING_CONFIRMATION -> {
                confirmation = true
                firstPhraseAt = utterance.endElapsedMs
                if (training) trainingResult = "waiting"
                signal()
            }
            VoiceDecision.CONFIRMED -> {
                val identity = expectedIdentity
                // Release the only microphone consumer BEFORE a normal incident can start AAC.
                disable()
                if (training) {
                    if (identity == controller.deviceIdentity() &&
                        preferences.edit().putString("lockedProof", proofValue()).commit()) {
                        trainingResult = "passed_locked"
                    } else message = "Não foi possível guardar o treino. Repita pelo aplicativo."
                } else {
                    val time = now()
                    if (!preferences.edit().putString("cooldownEnvironment", environment())
                            .putLong("cooldownUntil", time + 30_000L).commit()) {
                        message = "Não foi possível preparar o alerta por voz. Use os botões ou a notificação."
                        signal(); return
                    }
                    try { controller.trigger(false, "voice", identity ?: error("Vínculo indisponível")) }
                    catch (_: Exception) {
                        val saved = try {
                            val state = controller.status()
                            state["incidentId"] != null && (state["simulated"] == false || state["escalationPending"] == true)
                        } catch (_: Exception) { false }
                        if (!saved) preferences.edit().remove("cooldownUntil").remove("cooldownEnvironment").commit()
                        message = "Confira o envio do alerta no aplicativo. Se necessário, use os botões ou a notificação."
                    }
                }
                signal()
            }
            VoiceDecision.REJECTED, VoiceDecision.COOLDOWN, null -> {
                confirmation = false; firstPhraseAt = 0L; signal()
            }
        }
    }

    fun disable() {
        generation.incrementAndGet()
        enabled = false; listening = false; trainingUntil = 0L
        trainingResult = "idle"; confirmation = false; message = null
        expectedIdentity = null; firstPhraseAt = 0L; policy = null
        handler.removeCallbacks(monitor)
        if (observingUnlock) {
            context.unregisterReceiver(unlockReceiver)
            observingUnlock = false
        }
        engine.stop()
        signal()
    }

    private fun fail(reason: String) { disable(); message = reason; signal() }
    private fun signal() { controller.signal(); ProtectionService.current?.refreshNotification() }

    /** Executor-safe authorization fence; main-thread cleanup is posted before the next callback. */
    fun invalidateIdentity(): Boolean {
        generation.incrementAndGet()
        enabled = false; listening = false; trainingUntil = 0L; confirmation = false
        val saved = preferences.edit().clear().commit()
        handler.post { disable() }
        return saved
    }

    companion object {
        @Volatile private var instance: VoiceTrigger? = null
        fun get(context: Context): VoiceTrigger = instance ?: synchronized(this) {
            instance ?: VoiceTrigger(context.applicationContext).also { instance = it }
        }
    }
}

/** Notification stop is intentionally available without starting any Activity or new sensors. */
class VoiceStopReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) { VoiceTrigger.get(context).disable() }
}
