package br.gov.ro.lume.lume_navegador

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityManager

/** Only Android can bind this service, after the participant enables it in system settings. */
class PhysicalTriggerService : AccessibilityService() {
    private lateinit var trigger: PhysicalTrigger

    override fun onServiceConnected() {
        super.onServiceConnected()
        trigger = PhysicalTrigger.get(this)
        trigger.connected(true)
    }

    override fun onKeyEvent(event: KeyEvent): Boolean {
        try { if (::trigger.isInitialized) trigger.onKey(event) } catch (_: Exception) {
            ProtectionController.get(this).error("O atalho foi interrompido. Reabra o app e confira sua configuração.")
        }
        // Preserve a well-formed, unmodified stream and normal system volume/shortcuts.
        return false
    }

    // No screen events are requested, retained or inspected. No node/window/content APIs are used.
    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() { if (::trigger.isInitialized) trigger.interrupted() }
    override fun onUnbind(intent: Intent?): Boolean {
        if (::trigger.isInitialized) trigger.connected(false)
        return super.onUnbind(intent)
    }
    override fun onDestroy() {
        if (::trigger.isInitialized) trigger.connected(false)
        super.onDestroy()
    }
}

/** Main-thread coordinator. Training can never call the incident/sensor path. */
class PhysicalTrigger private constructor(private val context: Context) {
    private val preferences = context.getSharedPreferences("physical_trigger", Context.MODE_PRIVATE)
    private var sequence = PhysicalTriggerSequence()
    @Volatile private var bound = false
    @Volatile private var trainingUntil = 0L
    @Volatile private var trainingResult = "idle"
    private var allLocked = true
    private var lastKeyAt = 0L
    private var lastDeviceId: Int? = null
    private val controller get() = ProtectionController.get(context)

    // Proof is invalid after reboot or OS changes. It never establishes a claim about all OEMs.
    private fun environment(): String = "v1:${Build.FINGERPRINT}:${Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, -1)}"
    private fun proof(name: String) = context.getSystemService(KeyguardManager::class.java).isDeviceSecure &&
        preferences.getString(name, null) == environment()
    private fun enabled() = preferences.getBoolean("enabled", false)
    private fun conflict(): Boolean = context.getSystemService(AccessibilityManager::class.java)
        .getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK).any {
            it.resolveInfo.serviceInfo.packageName != context.packageName &&
                it.flags and AccessibilityServiceInfo.FLAG_REQUEST_FILTER_KEY_EVENTS != 0
        }
    private fun now() = SystemClock.elapsedRealtime()
    private fun training(): Boolean {
        if (trainingUntil != 0L && now() >= trainingUntil) {
            trainingUntil = 0L
            trainingResult = "expired"
            sequence.reset()
        }
        return trainingUntil != 0L
    }

    fun status(): Map<String, Any?> {
        // status is also read by the upload executor. Never mutate the main-thread recognizer here.
        val deadline = trainingUntil
        val expired = deadline != 0L && now() >= deadline
        val trainingActive = deadline != 0L && !expired
        val cooldown = if (preferences.getString("cooldownEnvironment", null) == environment())
            ((preferences.getLong("cooldownUntil", 0L) - now() + 999) / 1_000).coerceAtLeast(0L) else 0L
        return mapOf(
            "physicalConnected" to bound,
            "physicalConflict" to conflict(),
            "physicalEnabled" to enabled(),
            "physicalReady" to (enabled() && bound && !conflict() && controller.armed && controller.canRunLocationSession() && proof("lockedProof") && !trainingActive),
            "physicalTrainedLocked" to proof("lockedProof"),
            "physicalTraining" to if (expired) "expired" else trainingResult,
            "physicalCooldownSeconds" to cooldown,
        )
    }

    fun connected(value: Boolean) {
        bound = value
        interrupted()
    }

    fun interrupted() {
        sequence.reset()
        lastKeyAt = 0L
        lastDeviceId = null
        allLocked = true
        controller.signal()
    }

    fun beginTraining() {
        check(bound) { "Habilite o atalho de volume nas configurações de acessibilidade primeiro." }
        check(controller.status()["paired"] == true) { "Vincule este aparelho à central primeiro." }
        check(controller.eventId() == null) { "Aguarde o encerramento da ocorrência para treinar o atalho." }
        disable()
        check(preferences.edit().remove("lockedProof").commit()) { "Não foi possível iniciar um novo treino com segurança." }
        sequence = PhysicalTriggerSequence()
        trainingUntil = now() + 90_000L
        trainingResult = "waiting"
        interrupted()
    }

    fun cancelTraining() {
        trainingUntil = 0L
        trainingResult = "idle"
        interrupted()
    }

    fun enable(consent: Boolean) {
        check(consent) { "Confirme que deseja habilitar o acionamento físico real." }
        check(bound && proof("lockedProof")) { "Conclua o treino com o aparelho bloqueado antes de habilitar." }
        check(!conflict()) { "Outro serviço de acessibilidade também solicita as teclas. Use a alternativa da notificação e peça orientação à equipe." }
        check(!training()) { "Termine ou cancele o treino antes de habilitar." }
        check(controller.status()["paired"] == true && controller.armed && controller.canRunLocationSession()) {
            "Abra o app e ative a sessão antes de habilitar o atalho."
        }
        check(preferences.edit().putBoolean("enabled", true).putString("enabledIdentity", controller.deviceIdentity()).commit()) {
            "Não foi possível guardar a ativação do atalho."
        }
        sequence = PhysicalTriggerSequence()
        interrupted()
    }

    fun disable() {
        check(preferences.edit().putBoolean("enabled", false).commit()) { "Não foi possível desativar o atalho." }
        trainingUntil = 0L
        trainingResult = "idle"
        interrupted()
    }

    fun resetIdentity() {
        invalidateIdentity()
        cancelTraining()
    }

    /** Safe from the pairing/revocation executor; recognizer changes stay on the main thread. */
    fun invalidateIdentity(): Boolean = preferences.edit().clear().commit()

    fun onKey(event: KeyEvent) {
        val key = when (event.keyCode) {
            KeyEvent.KEYCODE_VOLUME_DOWN -> PhysicalTriggerSequence.Key.DOWN
            KeyEvent.KEYCODE_VOLUME_UP -> PhysicalTriggerSequence.Key.UP
            else -> { sequence.reset(); return }
        }
        if (event.action != KeyEvent.ACTION_DOWN && event.action != KeyEvent.ACTION_UP) {
            sequence.reset(); return
        }
        val isTraining = training()
        if (!bound || (!isTraining && (!enabled() || !proof("lockedProof")))) {
            sequence.reset(); return
        }
        val time = now()
        val gestureTime = event.eventTime
        // A stale gesture, device change or lock-state transition cannot complete another gesture.
        if (lastKeyAt == 0L || (gestureTime - lastKeyAt > 1_500L && event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) ||
            (lastDeviceId != null && lastDeviceId != event.deviceId)) {
            sequence.reset()
            allLocked = true
        }
        lastKeyAt = gestureTime
        lastDeviceId = event.deviceId
        val keyguard = context.getSystemService(KeyguardManager::class.java)
        allLocked = allLocked && keyguard.isKeyguardLocked && keyguard.isDeviceSecure
        // The system may delay volume callbacks while checking its own shortcuts. Measure the
        // gesture from original uptime timestamps; elapsed time separately covers sleep/cooldown.
        val matched = sequence.onKey(key, event.action == KeyEvent.ACTION_DOWN, gestureTime,
            event.repeatCount, event.downTime, event.isCanceled, cooldownNowMs = time)
        if (!matched) return
        if (isTraining) {
            if (allLocked) {
                val edit = preferences.edit().putString("lockedProof", environment())
                check(edit.commit()) { "Não foi possível guardar o resultado do treino." }
                trainingUntil = 0L
                trainingResult = "passed_locked"
            } else trainingResult = "unlocked"
            controller.signal()
            return
        }
        val remaining = preferences.getString("cooldownEnvironment", null) == environment() &&
            preferences.getLong("cooldownUntil", 0L) > time
        if (remaining) return
        // Persist the guard before queuing. Rebinding the service cannot bypass the cooldown.
        if (!preferences.edit().putString("cooldownEnvironment", environment())
                .putLong("cooldownUntil", time + 30_000L).commit()) {
            sequence = PhysicalTriggerSequence()
            controller.error("Não foi possível preparar o acionamento. Tente a sequência completa novamente ou use a notificação.")
            return
        }
        try {
            // Uses the existing encrypted, idempotent outbox. Never starts a new FGS from background.
            val expected = preferences.getString("enabledIdentity", null) ?: return
            controller.trigger(false, "volume", expected)
            if (!controller.armed) controller.error("Alerta preservado. A sessão parou; reabra o app para retomar os sensores.")
        } catch (_: Exception) {
            // A failed preference commit can happen after the durable row exists. Recover before deciding to retry.
            val saved = try {
                val state = controller.status()
                state["incidentId"] != null && (state["simulated"] == false || state["escalationPending"] == true)
            } catch (_: Exception) { false }
            if (!saved) {
                preferences.edit().remove("cooldownUntil").remove("cooldownEnvironment").commit()
                sequence = PhysicalTriggerSequence()
            }
            controller.error(if (saved) "Alerta preservado. Reabra o app para conferir o envio."
                else "Não foi possível preservar o acionamento. Tente a sequência completa novamente ou use a notificação.")
        }
    }

    companion object {
        @Volatile private var instance: PhysicalTrigger? = null
        fun get(context: Context): PhysicalTrigger = instance ?: synchronized(this) {
            instance ?: PhysicalTrigger(context.applicationContext).also { instance = it }
        }
    }
}
