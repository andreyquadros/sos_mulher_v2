package br.gov.ro.lume.lume_navegador

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.app.job.JobParameters
import android.app.job.JobService
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.media.MediaRecorder
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import java.io.File

class ProtectionService : Service(), LocationListener {
    private lateinit var controller: ProtectionController
    private lateinit var locations: LocationManager
    private val handler = Handler(Looper.getMainLooper())
    private var collecting = false
    private var recorder: MediaRecorder? = null
    private var recording: File? = null
    private var capturedAt = ""
    private var audioPaused = false
    private var audioPausedForStorage = false
    private var microphoneEnabled = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var stoppedReason: String? = null

    override fun onCreate() {
        super.onCreate()
        controller = ProtectionController.get(this)
        locations = getSystemService(LocationManager::class.java)
        current = this
        ProtectionNotifications.channels(this)
        // Only incomplete, private recorder scratch files are discarded. Durable chunks are encrypted in SQLite.
        File(cacheDir, "protection_recorder").listFiles()?.forEach { it.delete() }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            check(controller.canRunLocationSession()) {
                "Permissões ou localização indisponíveis. Reative a proteção pelo aplicativo."
            }
            val notification = ProtectionNotifications.session(this, controller.eventId() != null)
            microphoneEnabled = controller.consentAudio() && controller.hasPermission(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= 29) {
                var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                if (Build.VERSION.SDK_INT >= 30 && microphoneEnabled) {
                    types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                }
                startForeground(ProtectionNotifications.SESSION_ID, notification, types)
            } else startForeground(ProtectionNotifications.SESSION_ID, notification)
            controller.markServiceStarted()
            beginIncident()
            handler.removeCallbacks(tick)
            handler.post(tick)
        } catch (_: Exception) {
            stoppedReason = "O Android não iniciou a sessão. Abra o app, confira permissões e reative."
            controller.markServiceStopped(stoppedReason)
            stopSelf()
        }
        // Never claim an armed session survived process death; explicit visible rearming is required.
        return START_NOT_STICKY
    }

    private val tick = object : Runnable {
        override fun run() {
            if (!controller.canRunLocationSession()) {
                stoppedReason = "Permissão ou localização desativada. O alerta permanece na fila; reative a sessão no app."
                controller.markServiceStopped(stoppedReason)
                stopSelf()
                return
            }
            controller.synchronize()
            if (controller.eventId() != null && !controller.sharingPaused()) beginIncident() else endIncident()
            if (microphoneEnabled && !controller.hasPermission(Manifest.permission.RECORD_AUDIO)) {
                pauseAudio()
                controller.error("Microfone sem permissão. Alerta e localização continuam.")
            }
            if (audioPausedForStorage && controller.audioStorageRecovered()) {
                audioPausedForStorage = false
                audioPaused = false
            }
            if (collecting && microphoneEnabled && controller.consentAudio() && recorder == null && !audioPaused) startAudio()
            if (collecting && wakeLock?.isHeld != true) acquireWakeLock()
            handler.postDelayed(this, 5_000)
        }
    }

    /** Called after a durable incident exists. No provider or microphone is opened while merely armed. */
    fun beginIncident() {
        if (!controller.armed || controller.eventId() == null || controller.sharingPaused() || collecting) return
        collecting = true
        audioPaused = false
        audioPausedForStorage = false
        acquireWakeLock()
        try {
            val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)
                .filter { locations.isProviderEnabled(it) }
            for (provider in providers) {
                if (provider == LocationManager.GPS_PROVIDER &&
                    !controller.hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)) continue
                locations.requestLocationUpdates(provider, 5_000L, 0f, this, Looper.getMainLooper())
            }
            // A recent cached fix is useful only after the participant has requested assistance.
            providers.mapNotNull { provider ->
                try { locations.getLastKnownLocation(provider) } catch (_: SecurityException) { null }
            }.filter { System.currentTimeMillis() - it.time in 0..120_000 }
                .maxByOrNull { it.time }?.let { controller.location(it) }
        } catch (_: Exception) {
            controller.error("Não foi possível obter localização. O alerta continua sendo enviado.")
        }
        if (microphoneEnabled && controller.consentAudio()) startAudio()
        getSystemService(NotificationManager::class.java).notify(ProtectionNotifications.SESSION_ID,
            ProtectionNotifications.session(this, true))
    }

    private fun acquireWakeLock() {
        try {
            if (wakeLock == null) wakeLock = getSystemService(PowerManager::class.java)
                .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Lume:IncidentTransfer").apply { setReferenceCounted(false) }
            // Timeout is mandatory; tick renews only while an incident is actively collecting.
            wakeLock?.acquire(10 * 60_000L)
        } catch (_: Exception) { controller.error("O Android limitou a execução em segundo plano.") }
    }

    @Suppress("DEPRECATION")
    private fun startAudio() {
        if (!collecting || audioPaused || recorder != null || !microphoneEnabled || !controller.consentAudio() || controller.sharingPaused()) return
        if (!controller.hasPermission(Manifest.permission.RECORD_AUDIO)) {
            controller.error("Microfone indisponível. Alerta e localização continuam.")
            return
        }
        try {
            val directory = File(cacheDir, "protection_recorder").apply { mkdirs() }
            val file = File.createTempFile("chunk-", ".m4a", directory)
            recording = file
            capturedAt = ProtectionController.utcNow()
            val next = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(this) else MediaRecorder()
            recorder = next
            next.setAudioSource(MediaRecorder.AudioSource.MIC)
            next.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            next.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            next.setAudioChannels(1)
            next.setAudioSamplingRate(22_050)
            next.setAudioEncodingBitRate(32_000)
            next.setOutputFile(file.absolutePath)
            next.setOnErrorListener { _, _, _ ->
                controller.error("Falha no microfone. Alerta e localização continuam.")
                pauseAudio()
            }
            next.prepare()
            next.start()
            handler.postDelayed(rotateAudio, 4_000)
        } catch (_: Exception) {
            releaseRecorder(false)
            audioPaused = true
            controller.error("Não foi possível iniciar o áudio. Alerta e localização continuam.")
        }
    }

    private val rotateAudio = Runnable {
        releaseRecorder(true)
        if (collecting && !audioPaused && controller.consentAudio()) startAudio()
    }

    private fun releaseRecorder(save: Boolean) {
        handler.removeCallbacks(rotateAudio)
        val previous = recorder
        recorder = null
        val file = recording
        recording = null
        var complete = false
        if (previous != null) {
            try { previous.stop(); complete = true } catch (_: RuntimeException) {
                if (save) controller.error("Um bloco de áudio não pôde ser concluído. A localização continua.")
            } finally {
                try { previous.reset() } catch (_: RuntimeException) { }
                previous.release()
            }
        }
        if (file != null) {
            try {
                if (save && complete && controller.eventId() != null && file.length() in 1..512L * 1024) {
                    controller.audio(file.readBytes(), capturedAt)
                }
            } catch (_: Exception) { controller.error("Falha ao preservar áudio local. A localização continua.") }
            finally { file.delete() }
        }
    }

    fun pauseAudio() { audioPaused = true; audioPausedForStorage = false; releaseRecorder(false) }
    fun pauseAudioForStorage() { pauseAudio(); audioPausedForStorage = true }

    fun endIncident() {
        if (!collecting) return
        collecting = false
        releaseRecorder(false)
        try { locations.removeUpdates(this) } catch (_: Exception) { }
        if (wakeLock?.isHeld == true) wakeLock?.release()
        getSystemService(NotificationManager::class.java).notify(ProtectionNotifications.SESSION_ID,
            ProtectionNotifications.session(this, false))
    }

    override fun onLocationChanged(location: Location) {
        if (collecting && controller.eventId() != null && !controller.sharingPaused()) controller.location(location)
    }
    override fun onProviderDisabled(provider: String) {
        controller.error("Uma fonte de localização foi desativada. Confira a localização do aparelho.")
    }
    override fun onProviderEnabled(provider: String) = Unit
    @Deprecated("Required for older Android location callbacks")
    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        endIncident()
        current = null
        controller.markServiceStopped(stoppedReason ?: if (controller.eventId() != null)
            "A sessão parou. O alerta permanece registrado; reabra o app para retomar os sensores." else null)
        super.onDestroy()
    }
    override fun onBind(intent: Intent?): IBinder? = null

    companion object { @Volatile var current: ProtectionService? = null; private set }
}

class ProtectionUploadJob : JobService() {
    @Volatile private var cancelled = false
    override fun onStartJob(params: JobParameters): Boolean {
        cancelled = false
        running = true
        ProtectionController.get(this).synchronize { pending ->
            running = false
            if (!cancelled) jobFinished(params, pending)
        }
        return true
    }
    override fun onStopJob(params: JobParameters): Boolean { cancelled = true; running = false; return true }
    companion object { @Volatile var running = false }
}

object ProtectionNotifications {
    const val SESSION_ID = 7101
    private const val CHANNEL = "lume_session"
    fun channels(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) context.getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel(CHANNEL, "Sessão do Lume", NotificationManager.IMPORTANCE_LOW)
                .apply { description = "Estado da sessão de proteção ativada com seu consentimento."; setShowBadge(false) })
    }
    @Suppress("DEPRECATION")
    private fun builder(context: Context): Notification.Builder {
        channels(context)
        return (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL) else Notification.Builder(context))
            .setSmallIcon(R.drawable.ic_session).setContentTitle("Lume Navegador")
            .setVisibility(Notification.VISIBILITY_PRIVATE).setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_SERVICE)
    }
    private fun pending(context: Context, activity: Class<*>, request: Int): PendingIntent =
        PendingIntent.getActivity(context, request, Intent(context, activity)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    fun session(context: Context, incident: Boolean): Notification = builder(context)
        .setContentText(if (incident) "Solicitação em andamento. Abra para acompanhar." else "Sessão ativa. Controles disponíveis.")
        .setContentIntent(pending(context, MainActivity::class.java, 1)).setOngoing(true)
        .addAction(Notification.Action.Builder(null, "Ação rápida",
            pending(context, ProtectionConfirmationActivity::class.java, 2)).build()).build()
    fun rearm(context: Context) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED) return
        context.getSystemService(NotificationManager::class.java).notify(7103,
            builder(context).setContentText("Sessão pausada. Abra o aplicativo para reativar.")
                .setContentIntent(pending(context, MainActivity::class.java, 1)).setAutoCancel(true).build())
    }
}

class ProtectionBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED && intent.action != Intent.ACTION_MY_PACKAGE_REPLACED) return
        val controller = ProtectionController.get(context)
        if (controller.status()["paired"] == true) {
            controller.markServiceStopped("O aparelho reiniciou ou o app foi atualizado. Abra e reative a proteção.")
            ProtectionNotifications.rearm(context)
        }
        // No location, microphone or foreground-service start is attempted by this receiver.
    }
}
