package br.gov.ro.lume.lume_navegador

import org.junit.Assert.*
import org.junit.Test
import br.gov.ro.lume.lume_navegador.PhysicalTriggerSequence.Key
import kotlin.random.Random

class PhysicalTriggerSequenceTest {
    private fun click(
        sequence: PhysicalTriggerSequence,
        key: Key,
        start: Long,
        duration: Long = 100,
        cooldownOffsetMs: Long = 0
    ) {
        assertFalse(sequence.onKey(key, true, start, downTimeMs = start, cooldownNowMs = start + cooldownOffsetMs))
        assertFalse(sequence.onKey(key, false, start + duration, downTimeMs = start,
            cooldownNowMs = start + duration + cooldownOffsetMs))
    }

    private fun prefix(sequence: PhysicalTriggerSequence, start: Long = 0, cooldownOffsetMs: Long = 0): Long {
        click(sequence, Key.DOWN, start, cooldownOffsetMs = cooldownOffsetMs)
        click(sequence, Key.UP, start + 200, cooldownOffsetMs = cooldownOffsetMs)
        click(sequence, Key.DOWN, start + 400, cooldownOffsetMs = cooldownOffsetMs)
        assertEquals(3, sequence.completedClicks)
        return start + 600
    }

    private fun complete(
        sequence: PhysicalTriggerSequence,
        start: Long = 0,
        hold: Long = 2_000,
        cooldownOffsetMs: Long = 0
    ): Boolean {
        val finalPress = prefix(sequence, start, cooldownOffsetMs)
        assertFalse(sequence.onKey(Key.UP, true, finalPress, downTimeMs = finalPress,
            cooldownNowMs = finalPress + cooldownOffsetMs))
        return sequence.onKey(Key.UP, false, finalPress + hold, downTimeMs = finalPress,
            cooldownNowMs = finalPress + hold + cooldownOffsetMs)
    }

    @Test fun validPatternFiresOnlyOnFinalReleaseAndNeverOnRepeat() {
        val sequence = PhysicalTriggerSequence()
        val finalPress = prefix(sequence)
        assertFalse(sequence.onKey(Key.UP, true, finalPress, downTimeMs = finalPress))
        for (repeat in 1..5) {
            assertFalse(sequence.onKey(Key.UP, true, finalPress + repeat * 400, repeat, finalPress))
        }
        assertTrue(sequence.onKey(Key.UP, false, finalPress + 2_000, downTimeMs = finalPress))
        assertFalse(sequence.onKey(Key.UP, false, finalPress + 2_001, downTimeMs = finalPress))
        assertEquals(0, sequence.completedClicks)
    }

    @Test fun finalHoldHasInclusiveTwoAndFourSecondLimits() {
        assertTrue(complete(PhysicalTriggerSequence(), hold = 2_000))
        assertTrue(complete(PhysicalTriggerSequence(), hold = 4_000))
        assertFalse(complete(PhysicalTriggerSequence(), hold = 1_999))
        assertFalse(complete(PhysicalTriggerSequence(), hold = 4_001))
        assertFalse(complete(PhysicalTriggerSequence(), hold = 60_000))
    }

    @Test fun initialClicksHaveInclusiveOneSecondLimit() {
        val exact = PhysicalTriggerSequence()
        click(exact, Key.DOWN, 0, 1_000)
        click(exact, Key.UP, 1_100, 1_000)
        click(exact, Key.DOWN, 2_200, 1_000)
        assertFalse(exact.onKey(Key.UP, true, 3_300, downTimeMs = 3_300))
        assertTrue(exact.onKey(Key.UP, false, 5_300, downTimeMs = 3_300))

        val late = PhysicalTriggerSequence()
        click(late, Key.DOWN, 0, 1_001)
        assertEquals(0, late.completedClicks)
        assertFalse(late.requiresRelease)
        assertTrue(complete(late, start = 2_000))
    }

    @Test fun interActionGapHasInclusiveOneAndHalfSecondLimit() {
        val exact = PhysicalTriggerSequence()
        click(exact, Key.DOWN, 0)
        click(exact, Key.UP, 1_600)
        click(exact, Key.DOWN, 3_200)
        assertFalse(exact.onKey(Key.UP, true, 4_800, downTimeMs = 4_800))
        assertTrue(exact.onKey(Key.UP, false, 6_800, downTimeMs = 4_800))

        val late = PhysicalTriggerSequence()
        click(late, Key.DOWN, 0)
        assertFalse(late.onKey(Key.UP, true, 1_601, downTimeMs = 1_601))
        assertTrue(late.requiresRelease)
        assertFalse(late.onKey(Key.UP, false, 1_701, downTimeMs = 1_601))
        assertEquals(0, late.completedClicks)
        assertTrue(complete(late, start = 2_000))
    }

    @Test fun wholeSequenceWindowHasInclusiveTenSecondLimit() {
        fun reachFinal(sequence: PhysicalTriggerSequence) {
            click(sequence, Key.DOWN, 0, 1_000)
            click(sequence, Key.UP, 2_500, 1_000)
            click(sequence, Key.DOWN, 5_000, 1_000)
            assertFalse(sequence.onKey(Key.UP, true, 7_500, downTimeMs = 7_500))
        }
        val exact = PhysicalTriggerSequence()
        reachFinal(exact)
        assertTrue(exact.onKey(Key.UP, false, 10_000, downTimeMs = 7_500))
        val late = PhysicalTriggerSequence()
        reachFinal(late)
        assertFalse(late.onKey(Key.UP, false, 10_001, downTimeMs = 7_500))
    }

    @Test fun incorrectOrderCannotRestartWithoutReleasingItsKey() {
        val sequence = PhysicalTriggerSequence()
        assertFalse(sequence.onKey(Key.UP, true, 0, downTimeMs = 0))
        assertTrue(sequence.requiresRelease)
        assertFalse(sequence.onKey(Key.DOWN, true, 100, downTimeMs = 100))
        assertFalse(sequence.onKey(Key.DOWN, false, 200, downTimeMs = 100))
        assertTrue(sequence.requiresRelease)
        assertFalse(sequence.onKey(Key.UP, false, 300, downTimeMs = 0))
        assertFalse(sequence.requiresRelease)
        assertTrue(complete(sequence, start = 400))
    }

    @Test fun overlappingButtonsCancelAndRequireBothReleases() {
        val sequence = PhysicalTriggerSequence()
        assertFalse(sequence.onKey(Key.DOWN, true, 0, downTimeMs = 0))
        assertFalse(sequence.onKey(Key.UP, true, 100, downTimeMs = 100))
        assertTrue(sequence.requiresRelease)
        assertFalse(sequence.onKey(Key.DOWN, false, 200, downTimeMs = 0))
        assertTrue(sequence.requiresRelease)
        assertFalse(sequence.onKey(Key.UP, false, 300, downTimeMs = 100))
        assertFalse(sequence.requiresRelease)
        assertTrue(complete(sequence, start = 400))
    }

    @Test fun repeatsDoNotCreateClicksAndOrphanRepeatCannotStartASequence() {
        val sequence = PhysicalTriggerSequence()
        assertFalse(sequence.onKey(Key.DOWN, true, 0, repeatCount = 1, downTimeMs = 0))
        assertTrue(sequence.requiresRelease)
        assertFalse(sequence.onKey(Key.DOWN, false, 100, downTimeMs = 0))
        assertEquals(0, sequence.completedClicks)
        assertFalse(sequence.onKey(Key.DOWN, true, 200, downTimeMs = 200))
        for (repeat in 1..4) assertFalse(sequence.onKey(Key.DOWN, true, 200 + repeat * 100L, repeat, 200))
        assertFalse(sequence.onKey(Key.DOWN, false, 700, downTimeMs = 200))
        assertEquals(1, sequence.completedClicks)
    }

    @Test fun repeatedNonRepeatDownCancelsRatherThanAdvancing() {
        val sequence = PhysicalTriggerSequence()
        assertFalse(sequence.onKey(Key.DOWN, true, 0, downTimeMs = 0))
        assertFalse(sequence.onKey(Key.DOWN, true, 100, downTimeMs = 0))
        assertTrue(sequence.requiresRelease)
        assertFalse(sequence.onKey(Key.DOWN, false, 200, downTimeMs = 0))
        assertEquals(0, sequence.completedClicks)
        assertTrue(complete(sequence, start = 300))
    }

    @Test fun replayedDownTimeAndStaleReleaseNeverCompleteAnotherGesture() {
        val sequence = PhysicalTriggerSequence()
        click(sequence, Key.DOWN, 0)
        sequence.reset()
        assertFalse(sequence.onKey(Key.DOWN, true, 200, downTimeMs = 0))
        assertTrue(sequence.requiresRelease)
        assertFalse(sequence.onKey(Key.DOWN, false, 300, downTimeMs = 0))
        assertEquals(0, sequence.completedClicks)
        val finalPress = prefix(sequence, 400)
        assertFalse(sequence.onKey(Key.UP, true, finalPress, downTimeMs = finalPress))
        assertFalse(sequence.onKey(Key.UP, false, finalPress + 2_000, downTimeMs = 600))
        assertEquals(0, sequence.completedClicks)
    }

    @Test fun resetWhileHeldRequiresReleaseAndPreservesCooldown() {
        val held = PhysicalTriggerSequence()
        val finalPress = prefix(held)
        assertFalse(held.onKey(Key.UP, true, finalPress, downTimeMs = finalPress))
        held.reset()
        assertTrue(held.requiresRelease)
        assertFalse(held.onKey(Key.UP, false, finalPress + 2_000, downTimeMs = finalPress))
        assertTrue(complete(held, start = 3_000))

        val fired = PhysicalTriggerSequence()
        assertTrue(complete(fired))
        fired.reset()
        click(fired, Key.DOWN, 5_000)
        click(fired, Key.UP, 5_200)
        click(fired, Key.DOWN, 5_400)
        assertFalse(fired.onKey(Key.UP, true, 5_600, downTimeMs = 5_600))
        assertFalse(fired.onKey(Key.UP, false, 7_600, downTimeMs = 5_600))
        assertEquals(0, fired.completedClicks)
        // Trigger was at 2,600; a new first press is allowed exactly at 32,600.
        assertTrue(complete(fired, start = 32_600))
    }

    @Test fun pressStartedDuringCooldownMustReleaseEvenIfCooldownExpiresWhileHeld() {
        val sequence = PhysicalTriggerSequence()
        assertTrue(complete(sequence))
        assertFalse(sequence.onKey(Key.DOWN, true, 32_599, downTimeMs = 32_599))
        assertTrue(sequence.requiresRelease)
        assertFalse(sequence.onKey(Key.DOWN, true, 32_600, repeatCount = 1, downTimeMs = 32_599))
        assertFalse(sequence.onKey(Key.DOWN, false, 32_700, downTimeMs = 32_599))
        assertEquals(0, sequence.completedClicks)
        assertTrue(complete(sequence, start = 33_000))
    }

    @Test fun canceledOrBackwardsTimeEventsFailClosed() {
        val canceled = PhysicalTriggerSequence()
        val finalPress = prefix(canceled)
        assertFalse(canceled.onKey(Key.UP, true, finalPress, downTimeMs = finalPress))
        assertFalse(canceled.onKey(Key.UP, false, finalPress + 2_000, downTimeMs = finalPress, canceled = true))
        assertTrue(complete(canceled, start = 3_000))

        val backwards = PhysicalTriggerSequence()
        assertFalse(backwards.onKey(Key.DOWN, true, 1_000, downTimeMs = 1_000))
        assertFalse(backwards.onKey(Key.DOWN, false, 999, downTimeMs = 1_000))
        assertEquals(0, backwards.completedClicks)
        assertTrue(complete(backwards, start = 2_000))
    }

    @Test fun deepSleepCountsTowardCooldownWithoutAdvancingGestureUptime() {
        val sequence = PhysicalTriggerSequence()
        assertTrue(complete(sequence, cooldownOffsetMs = 3_600_000))
        // Uptime advances only 400 ms between gestures, but elapsed time also
        // includes an hour asleep. A second complete deliberate gesture works.
        assertTrue(complete(sequence, start = 3_000, cooldownOffsetMs = 7_200_000))
    }

    @Test fun cooldownUsesElapsedClockAndRetainsItsInclusiveBoundary() {
        val sequence = PhysicalTriggerSequence()
        assertTrue(complete(sequence, cooldownOffsetMs = 3_600_000))
        // Large event uptime alone cannot bypass a cooldown that has 1 ms left.
        assertFalse(sequence.onKey(Key.DOWN, true, 1_000_000, downTimeMs = 1_000_000,
            cooldownNowMs = 3_632_599))
        assertTrue(sequence.requiresRelease)
        assertFalse(sequence.onKey(Key.DOWN, false, 1_000_100, downTimeMs = 1_000_000,
            cooldownNowMs = 3_632_600))
        assertEquals(0, sequence.completedClicks)
        // The released key cannot seed a gesture; a fresh press is allowed at
        // the exact 30 s elapsed boundary, independently of event clock origin.
        assertTrue(complete(sequence, start = 1_000_200, cooldownOffsetMs = 2_632_400))
    }

    @Test fun eventTimesDetermineHoldWhenDeliveryTimesAreUneven() {
        val sequence = PhysicalTriggerSequence()
        val finalPress = prefix(sequence, cooldownOffsetMs = 3_600_000)
        assertFalse(sequence.onKey(Key.UP, true, finalPress, downTimeMs = finalPress,
            cooldownNowMs = 3_603_000))
        // The platform delivers the queued release only 1 ms after the press,
        // while its original event timestamp proves the required 2 s hold.
        assertTrue(sequence.onKey(Key.UP, false, finalPress + 2_000, downTimeMs = finalPress,
            cooldownNowMs = 3_603_001))
    }

    @Test fun invalidCooldownTimeCancelsAndCannotLowerItsMonotonicGuard() {
        val sequence = PhysicalTriggerSequence()
        assertFalse(sequence.onKey(Key.DOWN, true, 1_000, downTimeMs = 1_000,
            cooldownNowMs = 10_000))
        assertFalse(sequence.onKey(Key.DOWN, true, 1_050, repeatCount = 1, downTimeMs = 1_000,
            cooldownNowMs = 9_999))
        assertTrue(sequence.requiresRelease)
        assertFalse(sequence.onKey(Key.DOWN, false, 1_100, downTimeMs = 1_000,
            cooldownNowMs = 9_999))
        assertEquals(0, sequence.completedClicks)
        // Returning to the prior high-water mark lets the observed release
        // clear cancellation, but never completes the interrupted click.
        assertFalse(sequence.onKey(Key.DOWN, false, 1_200, downTimeMs = 1_000,
            cooldownNowMs = 10_000))
        assertFalse(sequence.requiresRelease)
        assertTrue(complete(sequence, start = 2_000, cooldownOffsetMs = 10_000))

        val negative = PhysicalTriggerSequence()
        assertFalse(negative.onKey(Key.DOWN, true, 0, downTimeMs = 0, cooldownNowMs = -1))
        assertTrue(negative.requiresRelease)
        assertFalse(negative.onKey(Key.DOWN, false, 100, downTimeMs = 0, cooldownNowMs = 100))
        assertTrue(complete(negative, start = 200))
    }

    @Test fun noGestureIdentityIsSupportedForPureCallersButCannotFireWithoutCompleteActions() {
        val sequence = PhysicalTriggerSequence()
        assertFalse(sequence.onKey(Key.DOWN, false, 0))
        for ((key, at) in listOf(Key.DOWN to 100L, Key.UP to 300L, Key.DOWN to 500L)) {
            assertFalse(sequence.onKey(key, true, at))
            assertFalse(sequence.onKey(key, false, at + 100))
        }
        assertFalse(sequence.onKey(Key.UP, true, 700))
        assertTrue(sequence.onKey(Key.UP, false, 2_700))
    }

    @Test fun randomNormalVolumeClicksAndLongPressesNeverEmitAnAlert() {
        val sequence = PhysicalTriggerSequence()
        val random = Random(20261018)
        var now = 0L
        // Ordinary clicks (under 0.5 s) and prolonged pocket/media presses (>4 s)
        // never contain the required deliberate final 2–4 s hold and release.
        repeat(2_000) {
            val key = if (random.nextBoolean()) Key.UP else Key.DOWN
            val duration = if (random.nextInt(4) == 0) random.nextLong(4_001, 12_000)
                else random.nextLong(1, 500)
            val identity = now
            assertFalse(sequence.onKey(key, true, now, downTimeMs = identity))
            if (duration > 20 && random.nextBoolean()) {
                assertFalse(sequence.onKey(key, true, now + duration / 2, repeatCount = 1, downTimeMs = identity))
            }
            now += duration
            assertFalse(sequence.onKey(key, false, now, downTimeMs = identity))
            now += random.nextLong(1, 2_000)
        }
        sequence.reset()
        assertTrue(complete(sequence, start = now + 1))
    }
}
