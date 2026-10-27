package br.gov.ro.lume.lume_navegador

import android.Manifest
import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel
import java.util.UUID

class MainActivity : FlutterActivity() {
    private lateinit var controller: ProtectionController
    private var channel: MethodChannel? = null
    private val handler = Handler(Looper.getMainLooper())
    private var resumed = false
    private var permissionResult: MethodChannel.Result? = null
    private var reservedResult: MethodChannel.Result? = null
    private var reservedGuideSession: String? = null
    private val reservedAccess = ReservedAccessPolicy()
    private val permissionHistory by lazy { getSharedPreferences("lume_permission_review", MODE_PRIVATE) }
    private val guideCounter by lazy {
        // Kept outside the encrypted pairing vault: relinking must not reset visits.
        val preferences = getSharedPreferences("lume_protection_guide", MODE_PRIVATE)
        ProtectionGuideCounter(
            readCount = { preferences.getInt("automatic_presentations", 0) },
            writeCount = { preferences.edit().putInt("automatic_presentations", it).commit() },
        )
    }
    private val listener: () -> Unit = { channel?.invokeMethod("statusChanged", statusWithPermissions()) }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        controller = ProtectionController.get(this)
        controller.addListener(listener)
        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "br.gov.ro.lume/protection")
        channel?.setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "status" -> result.success(statusWithPermissions())
                    "requestFloatingPermission" -> {
                        check(resumed && call.argument<Boolean>("consent") == true) {
                            "Confirme a autorização do botão antes de abrir as configurações."
                        }
                        check(controller.deviceIdentity() != null && controller.armed) {
                            "Vincule o aparelho e ative a proteção antes de configurar o botão."
                        }
                        if (!Settings.canDrawOverlays(this)) {
                            try {
                                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                                    Uri.parse("package:$packageName")))
                            } catch (_: Exception) {
                                throw IllegalStateException("Abra os ajustes do Android: Apps → Acesso especial → Aparecer sobre outros apps → Lume Navegador.")
                            }
                        }
                        result.success(statusWithPermissions())
                    }
                    "startFloatingTraining" -> {
                        check(resumed) { "Abra o aplicativo para iniciar o treino do botão." }
                        FloatingTrigger.get(this).startTraining()
                        result.success(statusWithPermissions())
                    }
                    "stopFloatingTraining" -> {
                        FloatingTrigger.get(this).stopTraining()
                        result.success(statusWithPermissions())
                    }
                    "setFloatingEnabled" -> {
                        val enable = call.argument<Boolean>("enabled") == true
                        check(!enable || resumed) { "Abra o aplicativo para ativar o botão flutuante." }
                        FloatingTrigger.get(this).setEnabled(enable, call.argument<Boolean>("consent") == true)
                        result.success(statusWithPermissions())
                    }
                    "beginVoiceTraining" -> {
                        check(resumed && call.argument<Boolean>("consent") == true) { "Abra o aplicativo e autorize o treino por voz." }
                        ProtectionService.current?.prepareVoiceMicrophone()
                        VoiceTrigger.get(this).beginTraining(call.argument<String>("phraseId") ?: "",
                            call.argument<Boolean>("consent") == true)
                        result.success(statusWithPermissions())
                    }
                    "cancelVoiceTraining" -> {
                        VoiceTrigger.get(this).cancelTraining()
                        result.success(statusWithPermissions())
                    }
                    "enableVoiceTrigger" -> {
                        check(resumed && call.argument<Boolean>("consent") == true) { "Abra o aplicativo e autorize o acionamento por frase." }
                        ProtectionService.current?.prepareVoiceMicrophone()
                        VoiceTrigger.get(this).enable(call.argument<Boolean>("consent") == true)
                        result.success(statusWithPermissions())
                    }
                    "disableVoiceTrigger" -> {
                        VoiceTrigger.get(this).disable()
                        result.success(statusWithPermissions())
                    }
                    "physicalSettings" -> {
                        check(resumed && call.argument<Boolean>("consent") == true) {
                            "Confirme a autorização do atalho antes de abrir as configurações."
                        }
                        startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
                        result.success(statusWithPermissions())
                    }
                    "beginPhysicalTraining" -> {
                        check(resumed) { "Abra o aplicativo para iniciar o treino." }
                        PhysicalTrigger.get(this).beginTraining()
                        result.success(statusWithPermissions())
                    }
                    "cancelPhysicalTraining" -> {
                        PhysicalTrigger.get(this).cancelTraining()
                        result.success(statusWithPermissions())
                    }
                    "enablePhysicalTrigger" -> {
                        check(resumed) { "Abra o aplicativo para habilitar o atalho." }
                        PhysicalTrigger.get(this).enable(call.argument<Boolean>("consent") == true)
                        result.success(statusWithPermissions())
                    }
                    "disablePhysicalTrigger" -> {
                        PhysicalTrigger.get(this).disable()
                        result.success(statusWithPermissions())
                    }
                    "authenticateReserved" -> authenticateReserved(result)
                    "claimProtectionGuide" -> {
                        val session = reservedGuideSession
                        check(resumed && session != null) {
                            "Abra a área reservada e confirme o acesso para consultar o guia."
                        }
                        val claim = guideCounter.claim(session)
                        result.success(mapOf("show" to claim.show, "visit" to claim.visit))
                    }
                    "leaveReserved" -> {
                        reservedGuideSession = null
                        reservedAccess.transition(ReservedAccessPolicy.Event.INVALIDATE)
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        result.success(statusWithPermissions())
                    }
                    "configure" -> controller.configure(call.arguments as? Map<*, *> ?: emptyMap<String, Any>()) { configured ->
                        configured.fold({ result.success(statusWithPermissions()) }, { result.error("configuration", it.message, null) })
                    }
                    "requestPermissions" -> {
                        check(resumed) { "Abra o aplicativo para conceder permissões." }
                        check(permissionResult == null) { "Já existe uma solicitação de permissões aberta." }
                        val missing = requestablePermissions()
                        if (missing.isEmpty()) {
                            // Already granted or denied without another runtime prompt: the review UI explains both.
                            result.success(statusWithPermissions())
                        } else {
                            permissionResult = result
                            try { requestPermissions(missing, PERMISSION_REQUEST) }
                            catch (failure: Exception) { permissionResult = null; throw failure }
                        }
                    }
                    "openAppSettings", "openLocationSettings" -> {
                        check(resumed && reservedAccess.allowed && call.argument<Boolean>("consent") == true) {
                            "Entre na área reservada e confirme a abertura dos ajustes do Android."
                        }
                        val intent = if (call.method == "openAppSettings")
                            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))
                        else Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)
                        try { reservedAccess.openSettings { startActivity(intent) } } catch (_: Exception) {
                            throw IllegalStateException(if (call.method == "openAppSettings")
                                "Abra os ajustes do Android: Apps → Lume Navegador → Permissões."
                                else "Abra os ajustes de localização do Android para conferir se a localização está ligada.")
                        }
                        // onPause invalidates reserved access. Opening settings never rearms or starts sensors.
                        result.success(statusWithPermissions())
                    }
                    "arm" -> {
                        check(resumed) { "Abra o aplicativo para reativar a proteção." }
                        controller.arm()
                        handler.postDelayed({ result.success(statusWithPermissions()) }, 350)
                    }
                    "disarm" -> { controller.disarm(); result.success(statusWithPermissions()) }
                    "stopSharing" -> { controller.stopSharing(); result.success(statusWithPermissions()) }
                    "trigger" -> {
                        check(resumed) { "Abra o aplicativo para solicitar apoio." }
                        val args = call.arguments as? Map<*, *> ?: emptyMap<String, Any>()
                        val source = args["trigger"] as? String ?: "hold"
                        check(source in setOf("hold", "volume", "notification")) {
                            "O acionamento por voz depende das duas frases reconhecidas pelo serviço."
                        }
                        controller.trigger(args["simulated"] == true, source)
                        if (!controller.armed && controller.canRunLocationSession()) {
                            try { controller.arm() } catch (_: Exception) {
                                controller.error("Alerta preservado. Abra o aplicativo para reativar os sensores.")
                            }
                        }
                        if (!controller.armed && !controller.canRunLocationSession()) {
                            controller.error("Alerta preservado para envio. Sensores indisponíveis; confira permissões e localização do aparelho.")
                        }
                        result.success(statusWithPermissions())
                    }
                    else -> result.notImplemented()
                }
            } catch (failure: Exception) {
                result.error(if (call.method == "arm" || call.method == "requestPermissions") "permissions" else "protection",
                    failure.message ?: "A operação não pôde ser concluída.", null)
            }
        }
    }

    private fun permissionState(permission: String, required: Boolean = true): PermissionPolicy.State =
        PermissionPolicy.state(required, controller.hasPermission(permission),
            permissionHistory.getBoolean(permission, false), shouldShowRequestPermissionRationale(permission))

    private fun permissionDetails(): Map<String, Any> {
        val location = PermissionPolicy.location(permissionState(Manifest.permission.ACCESS_COARSE_LOCATION),
            permissionState(Manifest.permission.ACCESS_FINE_LOCATION))
        val microphone = permissionState(Manifest.permission.RECORD_AUDIO, controller.consentAudio())
        val notifications = if (Build.VERSION.SDK_INT >= 33) permissionState(Manifest.permission.POST_NOTIFICATIONS)
            else PermissionPolicy.State.NOT_REQUIRED
        val states = listOf(location, microphone, notifications)
        return mapOf("location" to location.wire,
            "preciseLocation" to controller.hasPermission(Manifest.permission.ACCESS_FINE_LOCATION),
            "microphone" to microphone.wire, "notifications" to notifications.wire,
            "gpsEnabled" to controller.locationEnabled(),
            "canRequest" to states.contains(PermissionPolicy.State.REQUEST),
            "needsAppSettings" to states.contains(PermissionPolicy.State.SETTINGS))
    }

    private fun statusWithPermissions(): Map<String, Any?> = controller.status() +
        mapOf("permissionDetails" to permissionDetails())

    private fun requestablePermissions(): Array<String> {
        val details = permissionDetails()
        return buildList {
            if (details["location"] == PermissionPolicy.State.REQUEST.wire) {
                // Android requires coarse and fine together. Never ask for precise again after approximate was granted.
                add(Manifest.permission.ACCESS_COARSE_LOCATION)
                add(Manifest.permission.ACCESS_FINE_LOCATION)
            }
            if (details["microphone"] == PermissionPolicy.State.REQUEST.wire) add(Manifest.permission.RECORD_AUDIO)
            if (Build.VERSION.SDK_INT >= 33 && details["notifications"] == PermissionPolicy.State.REQUEST.wire)
                add(Manifest.permission.POST_NOTIFICATIONS)
        }.toTypedArray()
    }

    @Suppress("DEPRECATION")
    private fun authenticateReserved(result: MethodChannel.Result) {
        reservedGuideSession = null
        reservedAccess.transition(ReservedAccessPolicy.Event.INVALIDATE)
        if (!resumed) {
            result.error("authentication_unavailable", "Abra o aplicativo para continuar.", null)
            return
        }
        if (reservedResult != null) {
            result.error("authentication_busy", "Aguarde a confirmação em andamento.", null)
            return
        }
        val keyguard = getSystemService(KeyguardManager::class.java)
        if (!keyguard.isDeviceSecure) {
            result.error("device_lock", "Configure um bloqueio seguro no aparelho para acessar esta área.", null)
            return
        }
        val confirmation = keyguard.createConfirmDeviceCredentialIntent(
            "Confirmar acesso", "Use a credencial deste aparelho para continuar.")
        if (confirmation == null) {
            result.error("device_lock", "O bloqueio seguro do aparelho não está disponível.", null)
            return
        }
        // The credential is entered only into Android's own UI. No app PIN, credential or auth grant is persisted.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        reservedResult = result
        try {
            startActivityForResult(confirmation, RESERVED_REQUEST)
        } catch (_: Exception) {
            reservedResult = null
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            result.error("authentication_unavailable", "Não foi possível confirmar o acesso neste aparelho.", null)
        }
    }

    @Deprecated("Android device-credential confirmation uses the platform activity result.")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != RESERVED_REQUEST) return
        val pending = reservedResult ?: return
        reservedResult = null
        if (resultCode == Activity.RESULT_OK) {
            // Reapply after the system prompt; Flutter may have cleared the flag while leaving a private surface on pause.
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
            reservedGuideSession = UUID.randomUUID().toString()
            reservedAccess.transition(ReservedAccessPolicy.Event.AUTHENTICATED)
            try { pending.success(statusWithPermissions()) } catch (_: Exception) {
                reservedGuideSession = null
                reservedAccess.transition(ReservedAccessPolicy.Event.INVALIDATE)
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                pending.error("authentication_unavailable", "Não foi possível abrir esta área. Tente novamente.", null)
            }
        } else {
            reservedGuideSession = null
            reservedAccess.transition(ReservedAccessPolicy.Event.INVALIDATE)
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            pending.error("authentication_cancelled", "Confirmação cancelada.", null)
        }
    }

    private val foregroundSync = object : Runnable {
        override fun run() {
            if (!resumed) return
            // A sensor-degraded alert still needs receipt/assignment/resolution updates while its UI is open.
            controller.synchronize()
            handler.postDelayed(this, 5_000)
        }
    }

    override fun onResume() {
        super.onResume(); resumed = true
        reservedAccess.transition(ReservedAccessPolicy.Event.RESUMED)
        FloatingTrigger.get(this).refresh()
        handler.removeCallbacks(foregroundSync); handler.post(foregroundSync); controller.signal()
    }
    override fun onPause() {
        resumed = false
        reservedGuideSession = null
        // A transparent runtime permission prompt may pause without stopping this Activity.
        // It cannot authenticate a new session; it may only retain the existing one until it returns.
        reservedAccess.transition(if (permissionResult != null) ReservedAccessPolicy.Event.OWN_PERMISSION_PAUSE
            else ReservedAccessPolicy.Event.INVALIDATE)
        handler.removeCallbacks(foregroundSync); super.onPause()
    }

    override fun onStop() {
        // Home, Settings, lockscreen and full backgrounding always invalidate private access,
        // even if a runtime permission result arrives later.
        reservedAccess.transition(ReservedAccessPolicy.Event.INVALIDATE)
        super.onStop()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == PERMISSION_REQUEST) {
            reservedAccess.transition(ReservedAccessPolicy.Event.PERMISSION_RESULT)
            // Persist only a completed system callback, not an attempted launch that may have failed.
            val known = setOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS)
            permissionHistory.edit().apply {
                permissions.filter { it in known }.forEach { putBoolean(it, true) }
            }.commit()
            if (!controller.hasAllPermissions()) controller.error("Permissões incompletas. Confira a configuração antes de ativar.")
            val pending = permissionResult
            permissionResult = null
            pending?.success(statusWithPermissions())
            controller.signal()
        }
    }

    override fun onDestroy() {
        reservedGuideSession = null
        reservedAccess.transition(ReservedAccessPolicy.Event.INVALIDATE)
        if (::controller.isInitialized) controller.removeListener(listener)
        channel?.setMethodCallHandler(null); channel = null
        handler.removeCallbacksAndMessages(null)
        permissionResult?.error("activity_closed", "Reabra o aplicativo para conceder permissões.", null)
        permissionResult = null
        reservedResult?.error("activity_closed", "Reabra o aplicativo para confirmar o acesso.", null)
        reservedResult = null
        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        super.onDestroy()
    }

    companion object {
        private const val RESERVED_REQUEST = 7105
        private const val PERMISSION_REQUEST = 7104
    }
}
