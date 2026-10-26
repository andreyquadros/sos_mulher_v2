package br.gov.ro.lume.lume_navegador

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import kotlin.math.abs
import kotlin.math.min

/** Opt-in, bounded overlay owned by the already-running protection session. No independent FGS. */
class FloatingTrigger private constructor(private val context: Context) {
    private val main = Handler(Looper.getMainLooper())
    private val windows = context.getSystemService(WindowManager::class.java)
    private val power = context.getSystemService(PowerManager::class.java)
    private val keyguard = context.getSystemService(KeyguardManager::class.java)
    private var policy = FloatingHoldPolicy()
    private val controller get() = ProtectionController.get(context)
    @Volatile private var enabled = false
    @Volatile private var visible = false
    @Volatile private var trainingUntil = 0L
    @Volatile private var trainedIdentity: String? = null
    @Volatile private var enabledIdentity: String? = null
    @Volatile private var failure: String? = null
    @Volatile private var cooldownSeconds = 0L
    private var view: BrowserButton? = null
    private var layout: WindowManager.LayoutParams? = null
    private var watching = false

    fun permission(): Boolean = Settings.canDrawOverlays(context)
    fun status(): Map<String, Any?> = mapOf(
        "floatingPermission" to permission(),
        "floatingEnabled" to (enabled && permission()),
        "floatingVisible" to visible,
        "floatingTraining" to (trainingUntil > SystemClock.uptimeMillis()),
        "floatingTrainingPassed" to (trainedIdentity != null && trainedIdentity == controller.deviceIdentity()),
        "floatingError" to failure,
        "floatingCooldownSeconds" to cooldownSeconds,
    )

    private fun ready(identity: String?): Boolean = identity != null && identity == controller.deviceIdentity() &&
        controller.armed && controller.canRunLocationSession() && !controller.sharingPaused()

    private fun requireSession(): String {
        val identity = controller.deviceIdentity()
        check(identity != null && ready(identity)) { "Vincule o aparelho e ative a proteção antes de usar o botão flutuante." }
        check(permission()) { "Permita que o Lume apareça sobre outros apps nas configurações do Android." }
        return identity
    }

    fun startTraining() {
        val identity = requireSession()
        check(controller.eventId() == null) { "Aguarde o encerramento da ocorrência para treinar." }
        disable(clearProof = true)
        enabledIdentity = identity
        trainingUntil = SystemClock.uptimeMillis() + 90_000L
        failure = null
        watch()
        refresh()
        controller.signal()
    }

    fun stopTraining() {
        trainingUntil = 0L
        stopIfUnused()
        controller.signal()
    }

    fun setEnabled(value: Boolean, consent: Boolean = false) {
        if (!value) { disable(clearProof = false); return }
        check(consent) { "Confirme que deseja ativar o botão flutuante real." }
        val identity = requireSession()
        check(controller.eventId() == null) { "Aguarde o encerramento da ocorrência antes de ativar o botão." }
        check(trainedIdentity == identity && trainingUntil == 0L) { "Conclua primeiro o treino local de cinco segundos." }
        enabledIdentity = identity
        enabled = true
        failure = null
        policy.cancel()
        watch()
        refresh()
        controller.signal()
    }

    /** Identity/lifecycle calls may originate on the upload executor. Reject touches immediately. */
    fun invalidateIdentity() = disable(clearProof = true)
    fun disable(clearProof: Boolean = true) {
        enabled = false
        trainingUntil = 0L
        enabledIdentity = null
        if (clearProof) trainedIdentity = null
        if (Looper.myLooper() == Looper.getMainLooper()) stopIfUnused()
        else main.post { stopIfUnused() }
        controller.signal()
    }

    fun refresh() {
        if (Looper.myLooper() != Looper.getMainLooper()) { main.post { refresh() }; return }
        val training = trainingUntil != 0L
        if (!enabled && !training) { stopIfUnused(); return }
        if (!permission()) { fail("Permissão do botão removida. Autorize novamente no Android e refaça o treino."); return }
        if (!ready(enabledIdentity)) { fail("A sessão do botão parou. Abra o app, confira a proteção e refaça o treino."); return }
        if (training && SystemClock.uptimeMillis() >= trainingUntil) {
            trainingUntil = 0L
            failure = "O treino terminou sem completar cinco segundos. Você pode tentar novamente."
            stopIfUnused()
            controller.signal()
            return
        }
        if (!power.isInteractive || keyguard.isKeyguardLocked) { removeView(); return }
        if (view == null) addView()
        val cooldown = policy.cooldownSeconds(SystemClock.uptimeMillis())
        if (cooldownSeconds != cooldown) { cooldownSeconds = cooldown; controller.signal() }
    }

    private fun fail(message: String) {
        failure = message
        disable(clearProof = true)
    }

    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) { removeView(); refresh() }
    }
    private val monitor = object : Runnable {
        override fun run() {
            refresh()
            if (watching) main.postDelayed(this, 250L)
        }
    }
    private fun watch() {
        if (watching) return
        watching = true
        try {
            val filter = IntentFilter().apply {
                addAction(Intent.ACTION_SCREEN_OFF); addAction(Intent.ACTION_SCREEN_ON); addAction(Intent.ACTION_USER_PRESENT)
            }
            if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
            else context.registerReceiver(screenReceiver, filter)
            main.post(monitor)
        } catch (_: Exception) { watching = false; fail("O Android não permitiu acompanhar o estado do botão. Reabra o aplicativo.") }
    }
    private fun stopIfUnused() {
        if (enabled || trainingUntil != 0L) return
        removeView()
        if (watching) {
            watching = false
            main.removeCallbacks(monitor)
            try { context.unregisterReceiver(screenReceiver) } catch (_: IllegalArgumentException) { }
        }
    }

    @Suppress("DEPRECATION")
    private fun addView() {
        val size = dp(56f)
        val metrics = context.resources.displayMetrics
        val previous = layout
        val params = WindowManager.LayoutParams(size, size,
            if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT).apply {
            gravity = Gravity.TOP or Gravity.START
            x = (previous?.x ?: (metrics.widthPixels - size - dp(12f))).coerceAtLeast(0)
            y = (previous?.y ?: dp(76f)).coerceAtLeast(0)
            setTitle("Lume")
        }
        val button = BrowserButton()
        try {
            windows.addView(button, params)
            layout = params
            view = button
            visible = true
            controller.signal()
        } catch (_: Exception) { fail("O Android não exibiu o botão. Confira a permissão de aparecer sobre outros apps.") }
    }

    private fun removeView() {
        policy.cancel()
        val old = view
        view = null
        if (old != null) {
            old.cancelContact()
            try { windows.removeViewImmediate(old) } catch (_: Exception) { }
        }
        if (visible) { visible = false; controller.signal() }
    }

    private fun completeHold() {
        val identity = enabledIdentity
        if (!ready(identity) || !permission() || !power.isInteractive || keyguard.isKeyguardLocked) { refresh(); return }
        if (trainingUntil > SystemClock.uptimeMillis()) {
            trainedIdentity = identity
            trainingUntil = 0L
            policy = FloatingHoldPolicy()
            // Training never reaches the alert, outbox or sensor path.
            stopIfUnused()
            controller.signal()
        } else if (enabled && trainingUntil == 0L) {
            try {
                controller.trigger(false, "hold", identity)
            } catch (_: Exception) { fail("Não foi possível preservar o alerta do botão. Abra a área reservada e confira a conexão e o vínculo.") }
        }
    }

    private fun dp(value: Float): Int = (value * context.resources.displayMetrics.density + 0.5f).toInt()

    private inner class BrowserButton : View(context) {
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
        private var tracking = false
        private var contact = false
        private var dragging = false
        private var downX = 0f
        private var downY = 0f
        private var originX = 0
        private var originY = 0
        private val slop = ViewConfiguration.get(context).scaledTouchSlop
        private var progress = 0f
        init {
            contentDescription = "Lume · manter pressionado por cinco segundos"
            isClickable = true
            importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_YES
        }
        fun cancelContact() {
            tracking = false
            contact = false
            dragging = false
            progress = 0f
            policy.cancel()
            main.removeCallbacks(frame)
            invalidate()
        }
        private val frame = object : Runnable {
            override fun run() {
                if (!contact || dragging || view !== this@BrowserButton) return
                if (!ready(enabledIdentity) || !permission() || !power.isInteractive || keyguard.isKeyguardLocked) { cancelContact(); refresh(); return }
                val now = SystemClock.uptimeMillis()
                progress = policy.progress(now)
                if (policy.poll(now)) {
                    contact = false
                    progress = 0f
                    completeHold()
                    cooldownSeconds = policy.cooldownSeconds(now)
                    controller.signal()
                    invalidate()
                    return
                }
                // A cancelled/stalled contact cannot resume its old countdown.
                if (!policy.holding) { cancelContact(); return }
                invalidate()
                main.postDelayed(this, 32L)
            }
        }
        override fun onTouchEvent(event: MotionEvent): Boolean {
            if (event.flags and (MotionEvent.FLAG_WINDOW_IS_OBSCURED or MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED) != 0 ||
                event.pointerCount != 1 || event.actionMasked == MotionEvent.ACTION_POINTER_DOWN || event.actionMasked == MotionEvent.ACTION_POINTER_UP) {
                cancelContact(); return true
            }
            when (event.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    cancelContact()
                    if (!ready(enabledIdentity) || !permission() || !power.isInteractive || keyguard.isKeyguardLocked ||
                        abs(SystemClock.uptimeMillis() - event.eventTime) > 250L) return true
                    // Tracking movement is independent of eligibility to start another alert.
                    tracking = true
                    contact = policy.begin(SystemClock.uptimeMillis())
                    downX = event.rawX; downY = event.rawY
                    originX = layout?.x ?: 0; originY = layout?.y ?: 0
                    if (contact) main.post(frame)
                }
                MotionEvent.ACTION_MOVE -> {
                    if (!tracking) return true
                    if (!ready(enabledIdentity) || !permission() || !power.isInteractive || keyguard.isKeyguardLocked) {
                        cancelContact(); refresh(); return true
                    }
                    val deltaX = event.rawX - downX; val deltaY = event.rawY - downY
                    if (!dragging && (abs(deltaX) > slop || abs(deltaY) > slop)) {
                        dragging = true
                        contact = false
                        policy.cancel()
                        progress = 0f
                        main.removeCallbacks(frame)
                    }
                    if (dragging) {
                        val params = layout ?: return true
                        val metrics = resources.displayMetrics
                        params.x = (originX + deltaX.toInt()).coerceIn(0, (metrics.widthPixels - width).coerceAtLeast(0))
                        params.y = (originY + deltaY.toInt()).coerceIn(0, (metrics.heightPixels - height - dp(48f)).coerceAtLeast(0))
                        try { windows.updateViewLayout(this, params) } catch (_: Exception) { fail("O Android interrompeu o botão. Confira sua configuração no aplicativo.") }
                    } else if (event.x !in 0f..width.toFloat() || event.y !in 0f..height.toFloat()) cancelContact()
                    invalidate()
                }
                MotionEvent.ACTION_UP -> { val tap = contact && !dragging; cancelContact(); if (tap) performClick() }
                MotionEvent.ACTION_CANCEL, MotionEvent.ACTION_OUTSIDE -> cancelContact()
            }
            return true
        }
        override fun performClick(): Boolean { super.performClick(); return true }
        override fun onDetachedFromWindow() { cancelContact(); super.onDetachedFromWindow() }
        override fun onWindowVisibilityChanged(visibility: Int) {
            super.onWindowVisibilityChanged(visibility)
            if (visibility != VISIBLE) cancelContact()
            val displayed = visibility == VISIBLE && isAttachedToWindow
            if (view === this && visible != displayed) { visible = displayed; controller.signal() }
        }
        override fun onConfigurationChanged(newConfig: Configuration?) {
            cancelContact()
            super.onConfigurationChanged(newConfig)
            val params = layout ?: return
            val metrics = resources.displayMetrics
            params.x = params.x.coerceIn(0, (metrics.widthPixels - width).coerceAtLeast(0))
            params.y = params.y.coerceIn(0, (metrics.heightPixels - height - dp(48f)).coerceAtLeast(0))
            try { windows.updateViewLayout(this, params) } catch (_: Exception) { refresh() }
        }
        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val cx = width / 2f; val cy = height / 2f; val radius = min(cx, cy) - dp(3f)
            paint.style = Paint.Style.FILL; paint.color = Color.rgb(248, 248, 246)
            canvas.drawCircle(cx, cy, radius, paint)
            paint.style = Paint.Style.STROKE; paint.strokeWidth = dp(1.5f).toFloat(); paint.color = Color.rgb(102, 122, 135)
            canvas.drawCircle(cx, cy, radius * 0.56f, paint)
            val path = Path().apply {
                moveTo(cx + radius * 0.30f, cy - radius * 0.39f)
                lineTo(cx + radius * 0.08f, cy + radius * 0.11f)
                lineTo(cx - radius * 0.30f, cy + radius * 0.39f)
                lineTo(cx - radius * 0.08f, cy - radius * 0.11f)
                close()
            }
            paint.style = Paint.Style.FILL; paint.color = Color.rgb(48, 126, 144); canvas.drawPath(path, paint)
            if (progress > 0f) {
                paint.style = Paint.Style.STROKE; paint.strokeWidth = dp(3f).toFloat(); paint.color = Color.rgb(48, 126, 144)
                canvas.drawArc(cx - radius, cy - radius, cx + radius, cy + radius, -90f, 360f * progress, false, paint)
            }
        }
    }

    companion object {
        @Volatile private var instance: FloatingTrigger? = null
        fun get(context: Context): FloatingTrigger = instance ?: synchronized(this) {
            instance ?: FloatingTrigger(context.applicationContext).also { instance = it }
        }
    }
}
