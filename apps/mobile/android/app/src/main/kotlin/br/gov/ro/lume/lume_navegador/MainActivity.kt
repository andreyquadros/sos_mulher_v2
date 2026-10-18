package br.gov.ro.lume.lume_navegador

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.KeyEvent
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private lateinit var controller: ProtectionController
    private var channel: MethodChannel? = null
    private val handler = Handler(Looper.getMainLooper())
    private var resumed = false
    private var permissionResult: MethodChannel.Result? = null
    private var reservedResult: MethodChannel.Result? = null
    private val chord = VolumeChord()
    private val listener: () -> Unit = { channel?.invokeMethod("statusChanged", controller.status()) }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        controller = ProtectionController.get(this)
        controller.addListener(listener)
        channel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "br.gov.ro.lume/protection")
        channel?.setMethodCallHandler { call, result ->
            try {
                when (call.method) {
                    "status" -> result.success(controller.status())
                    "authenticateReserved" -> authenticateReserved(result)
                    "leaveReserved" -> {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                        result.success(controller.status())
                    }
                    "configure" -> controller.configure(call.arguments as? Map<*, *> ?: emptyMap<String, Any>()) { configured ->
                        configured.fold({ result.success(it) }, { result.error("configuration", it.message, null) })
                    }
                    "requestPermissions" -> {
                        check(resumed) { "Abra o aplicativo para conceder permissões." }
                        check(permissionResult == null) { "Já existe uma solicitação de permissões aberta." }
                        permissionResult = result
                        requestPermissions(controller.requiredPermissions(), 7104)
                    }
                    "arm" -> {
                        check(resumed) { "Abra o aplicativo para reativar a proteção." }
                        controller.arm()
                        handler.postDelayed({ result.success(controller.status()) }, 350)
                    }
                    "disarm" -> { controller.disarm(); result.success(controller.status()) }
                    "stopSharing" -> result.success(controller.stopSharing())
                    "trigger" -> {
                        check(resumed) { "Abra o aplicativo para solicitar apoio." }
                        val args = call.arguments as? Map<*, *> ?: emptyMap<String, Any>()
                        controller.trigger(args["simulated"] == true, args["trigger"] as? String ?: "hold")
                        if (!controller.armed && controller.canRunLocationSession()) {
                            try { controller.arm() } catch (_: Exception) {
                                controller.error("Alerta preservado. Abra o aplicativo para reativar os sensores.")
                            }
                        }
                        if (!controller.armed && !controller.canRunLocationSession()) {
                            controller.error("Alerta preservado para envio. Sensores indisponíveis; confira permissões e localização do aparelho.")
                        }
                        result.success(controller.status())
                    }
                    else -> result.notImplemented()
                }
            } catch (failure: Exception) {
                result.error(if (call.method == "arm" || call.method == "requestPermissions") "permissions" else "protection",
                    failure.message ?: "A operação não pôde ser concluída.", null)
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun authenticateReserved(result: MethodChannel.Result) {
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
            try { pending.success(controller.status()) } catch (_: Exception) {
                window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                pending.error("authentication_unavailable", "Não foi possível abrir esta área. Tente novamente.", null)
            }
        } else {
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
        handler.removeCallbacks(foregroundSync); handler.post(foregroundSync); controller.signal()
    }
    override fun onPause() {
        resumed = false; chord.reset(); handler.removeCallbacks(checkChord)
        handler.removeCallbacks(foregroundSync); super.onPause()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 7104) {
            if (!controller.hasAllPermissions()) controller.error("Permissões incompletas. Confira a configuração antes de ativar.")
            permissionResult?.success(controller.status()); permissionResult = null
        }
    }

    private val checkChord = Runnable {
        if (resumed && controller.armed && chord.shouldTrigger(SystemClock.elapsedRealtime())) {
            try { controller.trigger(false, "volume") } catch (_: Exception) {
                controller.error("O acionamento não foi concluído. Confira o vínculo no aplicativo.")
            }
        }
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (resumed && controller.armed && event.keyCode in arrayOf(KeyEvent.KEYCODE_VOLUME_UP, KeyEvent.KEYCODE_VOLUME_DOWN)) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                chord.key(event.keyCode == KeyEvent.KEYCODE_VOLUME_UP, true, SystemClock.elapsedRealtime())
                handler.removeCallbacks(checkChord); handler.postDelayed(checkChord, ProtectionPolicy.HOLD_MS)
            } else if (event.action == KeyEvent.ACTION_UP) {
                chord.key(event.keyCode == KeyEvent.KEYCODE_VOLUME_UP, false, SystemClock.elapsedRealtime())
                handler.removeCallbacks(checkChord)
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onDestroy() {
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

    companion object { private const val RESERVED_REQUEST = 7105 }
}
