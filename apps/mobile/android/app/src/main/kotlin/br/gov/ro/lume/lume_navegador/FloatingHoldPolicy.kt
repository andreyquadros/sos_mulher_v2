package br.gov.ro.lume.lume_navegador

/** Monotonic, single-contact hold. Each new contact must earn the full five seconds. */
class FloatingHoldPolicy {
    private var startedAt: Long? = null
    private var lastSampleAt: Long? = null
    private var cooldownUntil = 0L
    val holding: Boolean get() = startedAt != null

    fun begin(now: Long): Boolean {
        cancel()
        if (now < 0L || now < cooldownUntil) return false
        startedAt = now
        lastSampleAt = now
        return true
    }

    fun progress(now: Long): Float = startedAt?.let { ((now - it).toFloat() / HOLD_MILLIS).coerceIn(0f, 1f) } ?: 0f

    fun poll(now: Long): Boolean {
        val start = startedAt ?: return false
        val last = lastSampleAt ?: start
        // A stalled UI or clock discontinuity must require a fresh, observable contact.
        if (now < last || now - last > MAX_SAMPLE_GAP_MILLIS) { cancel(); return false }
        lastSampleAt = now
        if (now - start < HOLD_MILLIS) return false
        cancel()
        cooldownUntil = now + COOLDOWN_MILLIS
        return true
    }

    fun cancel() { startedAt = null; lastSampleAt = null }
    fun cooldownSeconds(now: Long): Long = ((cooldownUntil - now + 999L) / 1_000L).coerceAtLeast(0L)

    companion object {
        const val HOLD_MILLIS = 5_000L
        const val COOLDOWN_MILLIS = 30_000L
        const val MAX_SAMPLE_GAP_MILLIS = 1_000L
    }
}
