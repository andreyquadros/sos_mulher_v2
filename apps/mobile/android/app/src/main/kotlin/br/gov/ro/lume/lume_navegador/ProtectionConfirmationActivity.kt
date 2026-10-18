package br.gov.ro.lume.lume_navegador

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.quicksettings.TileService
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/** Generic emergency surface may cover keyguard, but never dismisses it or opens the private app. */
class ProtectionConfirmationActivity : Activity() {
    private val handler = Handler(Looper.getMainLooper())
    private lateinit var action: Button
    private lateinit var message: TextView
    private lateinit var progress: ProgressBar
    private var holdingSince: Long? = null
    private var resumed = false
    private var sent = false

    @Suppress("DEPRECATION")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= 27) setShowWhenLocked(true)
        else window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
        // Do not call requestDismissKeyguard, disableKeyguard or launch MainActivity here.
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setPadding(32, 48, 32, 48)
            setBackgroundColor(0xfff6f4f0.toInt())
        }
        layout.addView(TextView(this).apply {
            text = "Lume Navegador"; textSize = 24f; gravity = Gravity.CENTER
        })
        message = TextView(this).apply {
            text = "Segure o botão por 3 segundos para solicitar apoio. A localização e o áudio autorizado começam após o acionamento."
            textSize = 17f; gravity = Gravity.CENTER; setPadding(8, 32, 8, 32)
        }
        layout.addView(message)
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = ProtectionPolicy.HOLD_MS.toInt()
        }
        layout.addView(progress, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT))
        action = Button(this).apply {
            text = "Segure por 3 segundos"
            contentDescription = "Pressione e mantenha pressionado por três segundos para solicitar apoio"
            setOnClickListener { message.text = "Mantenha o botão pressionado por 3 segundos completos para enviar." }
            setOnTouchListener { view, event ->
                when (event.actionMasked) {
                    MotionEvent.ACTION_DOWN -> if (!sent && resumed) {
                        holdingSince = SystemClock.elapsedRealtime()
                        isPressed = true
                        handler.post(checkHold)
                    }
                    MotionEvent.ACTION_MOVE -> {
                        if (event.x < 0 || event.x > width || event.y < 0 || event.y > height) cancelHold()
                    }
                    MotionEvent.ACTION_UP -> {
                        cancelHold()
                        if (!sent) view.performClick()
                    }
                    MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_OUTSIDE -> cancelHold()
                }
                true
            }
        }
        layout.addView(action)
        layout.addView(Button(this).apply { text = "Voltar"; setOnClickListener { finish() } })
        layout.addView(TextView(this).apply {
            text = "Para acessar dados e configurações, desbloqueie o aparelho e abra o aplicativo."
            textSize = 14f; gravity = Gravity.CENTER; setPadding(8, 24, 8, 0)
        })
        setContentView(layout)
    }

    private val checkHold = object : Runnable {
        override fun run() {
            val started = holdingSince ?: return
            if (!resumed || sent) { cancelHold(); return }
            val elapsed = SystemClock.elapsedRealtime() - started
            progress.progress = elapsed.coerceAtMost(ProtectionPolicy.HOLD_MS).toInt()
            if (elapsed >= ProtectionPolicy.HOLD_MS) sendAlert()
            else handler.postDelayed(this, 50)
        }
    }

    private fun cancelHold() {
        holdingSince = null
        handler.removeCallbacks(checkHold)
        if (::action.isInitialized) action.isPressed = false
        if (::progress.isInitialized && !sent) progress.progress = 0
    }

    private fun sendAlert() {
        if (sent || !resumed) return
        sent = true
        holdingSince = null
        action.isEnabled = false
        val controller = ProtectionController.get(this)
        try {
            controller.trigger(false, "notification")
            // The Activity is user-visible above keyguard. It starts FGS before leaving this surface.
            if (!controller.armed && controller.canRunLocationSession()) {
                try { controller.arm() } catch (_: Exception) {
                    controller.error("Alerta preservado. Os sensores não iniciaram; confira o aplicativo após desbloquear.")
                }
            }
            message.text = "Solicitação salva. A confirmação da central pode ser consultada no aplicativo após desbloquear."
            action.text = "Solicitação salva"
            // Keep only this generic surface briefly; closing restores keyguard or the previous app.
            handler.postDelayed({ finish() }, 1_000)
        } catch (_: Exception) {
            sent = false
            action.isEnabled = true
            cancelHold()
            // Avoid rendering a participant name, backend message or any private configuration over keyguard.
            message.text = "Não foi possível salvar a solicitação. Desbloqueie o aparelho, abra o app e confira o vínculo."
        }
    }

    override fun onResume() { super.onResume(); resumed = true }
    override fun onPause() { resumed = false; cancelHold(); super.onPause() }
    override fun onDestroy() { handler.removeCallbacksAndMessages(null); super.onDestroy() }
}

class ProtectionTileService : TileService() {
    override fun onClick() {
        super.onClick()
        val intent = Intent(this, ProtectionConfirmationActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 3, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }
}
