package br.gov.ro.lume.lume_navegador

/** A brief tap prepares one separate, continuous hold. Every cancelled attempt needs a new tap. */
class FloatingHoldPolicy {
    private var tappedAt: Long? = null
    private var preparedUntil = 0L
    private var startedAt: Long? = null
    private var lastSampleAt: Long? = null
    private var cooldownUntil = 0L
    val holding: Boolean get() = startedAt != null
    val contactActive: Boolean get() = tappedAt != null || holding

    @Synchronized fun prepared(now: Long): Boolean = preparedUntil != 0L && now >= 0L && now < preparedUntil

    @Synchronized fun begin(now: Long): Boolean {
        val canHold = !contactActive && prepared(now)
        cancel()
        if (now < 0L || now < cooldownUntil) return false
        if (canHold) {
            startedAt = now
            lastSampleAt = now
        } else tappedAt = now
        return true
    }

    @Synchronized fun release(now: Long): Boolean {
        val tap = tappedAt
        val prepare = tap != null && now - tap in 0..MAX_TAP_MILLIS
        cancel()
        if (prepare) preparedUntil = now + PREPARATION_MILLIS
        return prepare
    }

    @Synchronized fun progress(now: Long): Float = startedAt?.let {
        ((now - it).toFloat() / HOLD_MILLIS).coerceIn(0f, 1f)
    } ?: 0f

    @Synchronized fun poll(now: Long): Boolean {
        tappedAt?.let {
            if (now - it !in 0..MAX_TAP_MILLIS) cancel()
            return false
        }
        val start = startedAt ?: return false
        val last = lastSampleAt ?: start
        // A stalled UI or clock discontinuity requires a fresh tap and contact.
        if (now < last || now - last > MAX_SAMPLE_GAP_MILLIS) { cancel(); return false }
        lastSampleAt = now
        if (now - start < HOLD_MILLIS) return false
        cancel()
        cooldownUntil = now + COOLDOWN_MILLIS
        return true
    }

    @Synchronized fun cancel() {
        tappedAt = null
        preparedUntil = 0L
        startedAt = null
        lastSampleAt = null
    }
    @Synchronized fun cooldownSeconds(now: Long): Long = ((cooldownUntil - now + 999L) / 1_000L).coerceAtLeast(0L)

    companion object {
        const val GESTURE_VERSION = 2
        const val MAX_TAP_MILLIS = 500L
        const val PREPARATION_MILLIS = 4_000L
        const val HOLD_MILLIS = 5_000L
        const val COOLDOWN_MILLIS = 30_000L
        const val MAX_SAMPLE_GAP_MILLIS = 1_000L
    }
}
