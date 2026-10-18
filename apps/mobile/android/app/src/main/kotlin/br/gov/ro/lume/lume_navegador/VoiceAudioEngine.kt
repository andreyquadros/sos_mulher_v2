package br.gov.ro.lume.lume_navegador

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioRecordingConfiguration
import android.media.AudioTimestamp
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import org.json.JSONObject
import org.vosk.LibVosk
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File
import java.io.IOException
import java.security.MessageDigest
import java.util.concurrent.Executor
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs
import kotlin.math.roundToLong

/** Offline full-vocabulary decoding. PCM and recognized text live in memory only.
 * Caller must be an already visible-started microphone foreground service with wearer consent.
 * Lifecycle/callbacks run on main; asset copying, model loading and inference run on one worker.
 */
class VoiceAudioEngine(context: Context) {
    private val context = context.applicationContext
    private val main = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "lume-offline-voice").apply { isDaemon = true }
    }
    @Volatile private var current: Session? = null
    private val captureLock = Any()

    private class Session(
        val onReady: () -> Unit,
        val onUtterance: (VoiceUtterance) -> Unit,
        val onError: (String) -> Unit,
    ) {
        val stopped = AtomicBoolean(false)
        var recorder: AudioRecord? = null // guarded by captureLock
        var recordingCallback: AudioManager.AudioRecordingCallback? = null
        var wakeLock: PowerManager.WakeLock? = null
        var watchdog: Runnable? = null
        @Volatile var lastReadElapsedMs = 0L
        var lastWakeRenewalMs = 0L
    }

    fun start(onReady: () -> Unit, onUtterance: (VoiceUtterance) -> Unit, onError: (String) -> Unit) {
        requireMain()
        stop()
        val session = Session(onReady, onUtterance, onError)
        current = session
        executor.execute { runSession(session) }
    }

    /** Invalidates queued callbacks and relinquishes microphone before returning. No join or
     * native close on main: the worker closes inference after its current call finishes. */
    fun stop() {
        requireMain()
        val session = current ?: return
        current = null
        session.stopped.set(true)
        session.watchdog?.let { main.removeCallbacks(it) }
        closeCapture(session)
    }

    @SuppressLint("MissingPermission")
    private fun runSession(session: Session) {
        var model: Model? = null
        var recognizer: Recognizer? = null
        val pcm = ShortArray(CHUNK_SAMPLES)
        try {
            if (!active(session)) return
            LibVosk.vosk_set_log_level(-10) // Minimum native verbosity; this code never logs recognized speech.
            val path = installModel(session)
            if (!active(session)) return
            model = Model(path.absolutePath)
            if (!active(session)) return
            // NO restricted grammar/phrase list: unrelated speech must remain unrelated speech.
            recognizer = Recognizer(model, SAMPLE_RATE.toFloat()).apply { setWords(true) }
            val minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
            if (minimum <= 0) throw IOException("microphone configuration unavailable")
            val recorder = AudioRecord.Builder()
                .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                .setAudioFormat(AudioFormat.Builder().setSampleRate(SAMPLE_RATE)
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT).setChannelMask(AudioFormat.CHANNEL_IN_MONO).build())
                .setBufferSizeInBytes(maxOf(minimum * 2, CHUNK_SAMPLES * 8)).build()
            var originMs: Long
            synchronized(captureLock) {
                if (!active(session)) { recorder.release(); return }
                session.recorder = recorder
                if (recorder.state != AudioRecord.STATE_INITIALIZED) throw IOException("microphone unavailable")
                if (Build.VERSION.SDK_INT >= 29) {
                    val callback = object : AudioManager.AudioRecordingCallback() {
                        override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
                            if (configs.any { it.clientAudioSessionId == recorder.audioSessionId && it.isClientSilenced })
                                fail(session, "Microfone indisponível ou silenciado pelo Android. Reative a sessão com o app aberto.")
                        }
                    }
                    session.recordingCallback = callback
                    recorder.registerAudioRecordingCallback(Executor { main.post(it) }, callback)
                }
                originMs = SystemClock.elapsedRealtime()
                recorder.startRecording()
                if (recorder.recordingState != AudioRecord.RECORDSTATE_RECORDING) throw IOException("microphone not recording")
                if (Build.VERSION.SDK_INT >= 29 && recorder.activeRecordingConfiguration?.isClientSilenced == true)
                    throw IOException("microphone silenced")
                val power = context.getSystemService(PowerManager::class.java)
                session.wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lume:offline-voice").apply {
                    setReferenceCounted(false)
                    acquire(WAKE_LEASE_MS)
                }
                session.lastWakeRenewalMs = originMs
                session.lastReadElapsedMs = originMs
            }
            post(session) { startWatchdog(session); session.onReady() }
            var samplesRead = 0L
            var calibrated = false
            var previousHardwareFrame = -1L
            var zeroSamples = 0L
            val timestamp = AudioTimestamp()
            while (active(session)) {
                val count = recorder.read(pcm, 0, pcm.size, AudioRecord.READ_BLOCKING)
                if (!active(session)) break
                if (count <= 0) throw IOException("microphone read failed")
                val now = SystemClock.elapsedRealtime()
                session.lastReadElapsedMs = now
                samplesRead += count
                if (recorder.getTimestamp(timestamp, AudioTimestamp.TIMEBASE_BOOTTIME) == AudioRecord.SUCCESS) {
                    val hardwareOrigin = timestamp.nanoTime / 1_000_000 - timestamp.framePosition * 1000 / SAMPLE_RATE
                    if (!calibrated && samplesRead == count.toLong()) {
                        originMs = hardwareOrigin
                        calibrated = true
                    } else if ((calibrated && abs(hardwareOrigin - originMs) > MAX_CAPTURE_LAG_MS) ||
                        timestamp.framePosition < previousHardwareFrame) throw IOException("microphone clock discontinuity")
                    previousHardwareFrame = timestamp.framePosition
                }
                val capturedThroughMs = originMs + samplesRead * 1000 / SAMPLE_RATE
                if (now - capturedThroughMs > MAX_CAPTURE_LAG_MS || capturedThroughMs - now > 500)
                    throw IOException("microphone backlog")
                // Sustained digital zero usually means denied/muted capture, rather than a quiet
                // room with real microphone noise. Fail closed instead of displaying ready.
                var allZero = true
                for (index in 0 until count) if (pcm[index].toInt() != 0) { allZero = false; break }
                zeroSamples = if (allZero) zeroSamples + count else 0
                if (zeroSamples >= SAMPLE_RATE * 8L) throw IOException("microphone silent")
                if (recognizer.acceptWaveForm(pcm, count)) {
                    val utterance = parseEndpoint(recognizer.result, originMs, samplesRead)
                    if (utterance != null) post(session) { session.onUtterance(utterance) }
                }
                pcm.fill(0, 0, count)
            }
        } catch (_: Exception) {
            if (active(session)) fail(session, "Escuta por voz interrompida. Confira o microfone e reative a sessão com o app aberto.")
        } catch (_: LinkageError) {
            if (active(session)) fail(session, "Reconhecimento offline indisponível neste aparelho. Use o acionamento por botões.")
        } finally {
            pcm.fill(0)
            closeCapture(session)
            runCatching { recognizer?.close() }
            runCatching { model?.close() }
        }
    }

    private fun parseEndpoint(json: String, originMs: Long, samplesRead: Long): VoiceUtterance? {
        val result = JSONObject(json)
        val text = result.optString("text", "")
        val array = result.optJSONArray("result")
        // Silent endpoint is not speech: allow the deliberate pause between phrases.
        if (text.isBlank() && (array == null || array.length() == 0)) return null
        val words = ArrayList<VoiceWord>()
        if (array != null && array.length() <= 64) for (index in 0 until array.length()) {
            val word = array.getJSONObject(index)
            words += VoiceWord(word.optString("word"), word.optDouble("conf", Double.NaN),
                word.optDouble("start", Double.NaN), word.optDouble("end", Double.NaN))
        }
        val first = words.firstOrNull()?.startSeconds ?: samplesRead.toDouble() / SAMPLE_RATE
        val last = words.lastOrNull()?.endSeconds ?: first
        if (!first.isFinite() || !last.isFinite() || first < 0 || last < first ||
            last > samplesRead.toDouble() / SAMPLE_RATE + 0.1) throw IOException("invalid recognition clock")
        return VoiceUtterance(text.take(512), words, originMs + (first * 1000).roundToLong(), originMs + (last * 1000).roundToLong())
    }

    private fun startWatchdog(session: Session) {
        if (!active(session)) return
        val check = object : Runnable {
            override fun run() {
                if (!active(session)) return
                val now = SystemClock.elapsedRealtime()
                if (now - session.lastReadElapsedMs > 10_000L) {
                    fail(session, "O microfone parou de responder. Reative a sessão de voz com o app aberto.")
                    return
                }
                synchronized(captureLock) {
                    if (!active(session)) return
                    if (now - session.lastWakeRenewalMs >= 30_000L) {
                        session.wakeLock?.acquire(WAKE_LEASE_MS)
                        session.lastWakeRenewalMs = now
                    }
                }
                main.postDelayed(this, 2_000L)
            }
        }
        session.watchdog = check
        main.postDelayed(check, 2_000L)
    }

    private fun closeCapture(session: Session) = synchronized(captureLock) {
        val recorder = session.recorder
        session.recorder = null
        if (recorder != null) {
            if (Build.VERSION.SDK_INT >= 29) session.recordingCallback?.let { callback ->
                runCatching { recorder.unregisterAudioRecordingCallback(callback) }
            }
            session.recordingCallback = null
            runCatching { recorder.stop() }
            runCatching { recorder.release() }
        }
        session.wakeLock?.let { if (it.isHeld) runCatching { it.release() } }
        session.wakeLock = null
    }

    private fun fail(session: Session, message: String) {
        // Fence immediately, including a main-thread recording-silenced callback: a previously
        // queued endpoint must never confirm while teardown waits in the main queue.
        if (!session.stopped.compareAndSet(false, true)) return
        main.post {
            if (current === session) {
                stop() // Release before caller can start incident MediaRecorder.
                session.onError(message)
            }
        }
    }
    private fun post(session: Session, callback: () -> Unit) { main.post { if (active(session)) callback() } }
    private fun active(session: Session): Boolean = current === session && !session.stopped.get()
    private fun requireMain() = check(Looper.myLooper() == Looper.getMainLooper()) { "VoiceAudioEngine lifecycle must run on main" }

    private fun installModel(session: Session): File {
        val manifest = context.assets.open("$ASSET_DIRECTORY/manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        if (manifest.getString("archiveSha256") != MODEL_SHA256) throw IOException("offline model manifest mismatch")
        val output = File(context.noBackupFilesDir, "voice-model-pt-${MODEL_SHA256.take(12)}")
        val marker = File(output, "complete.sha256")
        val files = manifest.getJSONArray("files")
        if (files.length() != 14) throw IOException("offline model incomplete")
        if (marker.isFile && marker.readText() == MODEL_SHA256 && (0 until files.length()).all { index ->
                val info = files.getJSONObject(index)
                val file = File(output, info.getString("path"))
                file.isFile && file.length() == info.getLong("size")
            }) return output
        val staging = File(context.noBackupFilesDir, "voice-model-pt.pending")
        staging.deleteRecursively()
        if (!staging.mkdirs()) throw IOException("offline model directory unavailable")
        try {
            for (index in 0 until files.length()) {
                if (!active(session)) throw IOException("cancelled")
                val info = files.getJSONObject(index)
                val path = info.getString("path")
                if (path.startsWith('/') || path.contains('\\') || path.split('/').any { it == ".." || it == "." })
                    throw IOException("offline model path invalid")
                val destination = File(staging, path)
                destination.parentFile?.mkdirs()
                val hash = MessageDigest.getInstance("SHA-256")
                var count = 0L
                context.assets.open("$ASSET_DIRECTORY/$path").use { input ->
                    destination.outputStream().use { target ->
                        val buffer = ByteArray(32768)
                        while (true) {
                            if (!active(session)) throw IOException("cancelled")
                            val read = input.read(buffer)
                            if (read == -1) break
                            count += read
                            if (count > info.getLong("size")) throw IOException("offline model size invalid")
                            hash.update(buffer, 0, read)
                            target.write(buffer, 0, read)
                        }
                    }
                }
                if (count != info.getLong("size") || hash.digest().joinToString("") { "%02x".format(it) } != info.getString("sha256"))
                    throw IOException("offline model checksum mismatch")
            }
            File(staging, "complete.sha256").writeText(MODEL_SHA256)
            output.deleteRecursively()
            if (!staging.renameTo(output)) throw IOException("offline model installation failed")
            return output
        } finally { staging.deleteRecursively() }
    }

    companion object {
        const val MODEL_SHA256 = "6e1ce909032e1afa7a88e68a3d628ecafff302bdf195befab308826c395e93b7"
        const val ASSET_DIRECTORY = "voice-model-pt"
        private const val SAMPLE_RATE = 16000
        private const val CHUNK_SAMPLES = 1600
        private const val MAX_CAPTURE_LAG_MS = 2500L
        private const val WAKE_LEASE_MS = 120_000L
        fun modelAvailable(context: Context): Boolean = runCatching {
            context.assets.open("$ASSET_DIRECTORY/manifest.json").bufferedReader().use {
                JSONObject(it.readText()).getString("archiveSha256") == MODEL_SHA256
            }
        }.getOrDefault(false)
    }
}
