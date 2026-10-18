package br.gov.ro.lume.lume_navegador

/**
 * Deliberate physical sequence: click DOWN, click UP, click DOWN, then hold UP
 * for 2–4 seconds and RELEASE. The final release is the only event that can fire.
 *
 * Each initial click lasts at most 1 second, gaps at most 1.5 seconds and the
 * complete sequence at most 10 seconds. A successful release starts a 30-second
 * cooldown. Auto-repeat cannot advance the sequence. Invalid order, overlapping
 * buttons, canceled events or timing violations discard the partial sequence;
 * all observed buttons must be released before trying again.
 *
 * Pure policy: no Android dependencies, timers, I/O or alert side effects. Call
 * [onKey] on one serialized input stream. Supply KeyEvent.eventTime (uptime) as
 * [nowMs] for gesture durations and SystemClock.elapsedRealtime() as
 * [cooldownNowMs] so deep sleep also counts toward cooldown. These clocks are
 * never compared with each other. Pass KeyEvent.downTime as [downTimeMs] on
 * BOTH press and release to reject replayed gestures; it is a gesture identity,
 * not a duration. The integration decides whether to send an alert or only
 * report a successful training sequence. Normal volume handling is unaffected.
 */
class PhysicalTriggerSequence {
    enum class Key { DOWN, UP }

    private val pressedKeys = mutableSetOf<Key>()
    private val latestDownIdentity = mutableMapOf<Key, Long>()
    private var step = 0
    private var sequenceStartedAt: Long? = null
    private var releasedAt: Long? = null
    private var heldKey: Key? = null
    private var heldAt: Long? = null
    private var heldIdentity: Long? = null
    private var waitingForRelease = false
    private var lastNow: Long? = null
    private var lastCooldownNow: Long? = null
    private var lastTriggerAt: Long? = null

    /** Initial clicks completed, useful for a local training indicator (0–3). */
    val completedClicks: Int get() = step

    /** True after cancellation while an observed physical key is still pressed. */
    val requiresRelease: Boolean get() = waitingForRelease

    /**
     * Returns true exactly once, on a valid final UP release. Repeated DOWN
     * events need their original nonzero [repeatCount], not a synthetic fresh
     * press. Providing [downTimeMs] additionally detects replayed non-repeat
     * events; it must match on press/release and increase for each key's next
     * gesture. [canceled] should include Android's canceled key-up flag. Both
     * clocks must be nonnegative and monotonic on this input stream. Pure
     * callers may omit [cooldownNowMs] when they intentionally use one clock.
     */
    fun onKey(
        key: Key,
        pressed: Boolean,
        nowMs: Long,
        repeatCount: Int = 0,
        downTimeMs: Long? = null,
        canceled: Boolean = false,
        cooldownNowMs: Long = nowMs
    ): Boolean {
        val wasPressed = key in pressedKeys
        if (pressed) pressedKeys.add(key) else pressedKeys.remove(key)

        val previousNow = lastNow
        val previousCooldownNow = lastCooldownNow
        if (nowMs < 0 || (previousNow != null && nowMs < previousNow) ||
            cooldownNowMs < 0 || (previousCooldownNow != null && cooldownNowMs < previousCooldownNow) ||
            repeatCount < 0 || (downTimeMs != null && downTimeMs < 0)) {
            cancelRecognition()
            return false
        }
        lastNow = nowMs
        lastCooldownNow = cooldownNowMs

        var freshIdentity = true
        if (pressed && repeatCount == 0 && downTimeMs != null) {
            val previousIdentity = latestDownIdentity[key]
            freshIdentity = previousIdentity == null || downTimeMs > previousIdentity
            if (freshIdentity) latestDownIdentity[key] = downTimeMs
        }

        if (canceled) {
            cancelRecognition()
            return false
        }
        if (waitingForRelease) {
            if (pressedKeys.isEmpty()) waitingForRelease = false
            return false
        }
        val firedAt = lastTriggerAt
        if ((firedAt != null && cooldownNowMs - firedAt < COOLDOWN_MS) || expired(nowMs)) {
            cancelRecognition()
            return false
        }

        if (repeatCount > 0) {
            // A repeat without the original press cannot prove a complete click.
            if (!pressed || !wasPressed || heldKey != key || heldIdentity != downTimeMs) cancelRecognition()
            return false
        }

        if (pressed) {
            val expected = if (step == 1 || step == 3) Key.UP else Key.DOWN
            if (wasPressed || !freshIdentity || pressedKeys.size != 1 || heldKey != null || key != expected) {
                cancelRecognition()
                return false
            }
            if (sequenceStartedAt == null) sequenceStartedAt = nowMs
            heldKey = key
            heldAt = nowMs
            heldIdentity = downTimeMs
            releasedAt = null
            return false
        }

        val started = heldAt
        if (!wasPressed || heldKey != key || started == null || pressedKeys.isNotEmpty() || heldIdentity != downTimeMs) {
            cancelRecognition()
            return false
        }
        val duration = nowMs - started
        if (step == 3) {
            val success = duration in HOLD_MIN_MS..HOLD_MAX_MS
            cancelRecognition()
            if (success) lastTriggerAt = cooldownNowMs
            return success
        }
        // expired() already enforces the inclusive maximum for the three clicks.
        heldKey = null
        heldAt = null
        heldIdentity = null
        releasedAt = nowMs
        step += 1
        return false
    }

    /**
     * Cancel on lifecycle/interruption/training-mode changes. This never clears
     * cooldown, replay identities or still-held physical keys. A release must
     * be observed for every held key before a fresh sequence is accepted.
     */
    fun reset() = cancelRecognition()

    private fun expired(nowMs: Long): Boolean {
        val beginning = sequenceStartedAt
        if (beginning != null && nowMs - beginning > SEQUENCE_WINDOW_MS) return true
        val heldBeginning = heldAt
        if (heldBeginning != null) {
            val maximum = if (step == 3) HOLD_MAX_MS else CLICK_MAX_MS
            if (nowMs - heldBeginning > maximum) return true
        } else {
            val lastRelease = releasedAt
            if (lastRelease != null && nowMs - lastRelease > GAP_MAX_MS) return true
        }
        return false
    }

    private fun cancelRecognition() {
        step = 0
        sequenceStartedAt = null
        releasedAt = null
        heldKey = null
        heldAt = null
        heldIdentity = null
        waitingForRelease = pressedKeys.isNotEmpty()
    }

    companion object {
        const val CLICK_MAX_MS = 1_000L
        const val GAP_MAX_MS = 1_500L
        const val HOLD_MIN_MS = 2_000L
        const val HOLD_MAX_MS = 4_000L
        const val SEQUENCE_WINDOW_MS = 10_000L
        const val COOLDOWN_MS = 30_000L
    }
}
