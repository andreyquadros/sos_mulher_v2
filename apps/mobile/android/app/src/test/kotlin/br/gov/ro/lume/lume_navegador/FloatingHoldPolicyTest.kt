package br.gov.ro.lume.lume_navegador

import org.junit.Assert.*
import org.junit.Test

class FloatingHoldPolicyTest {
    private fun sample(policy: FloatingHoldPolicy, from: Long, through: Long): Int {
        var fires = 0
        for (time in from..through step 100L) if (policy.poll(time)) fires++
        return fires
    }
    private fun prepare(policy: FloatingHoldPolicy, now: Long = 0L) {
        assertTrue(policy.begin(now))
        assertTrue(policy.release(now + 100L))
        assertTrue(policy.prepared(now + 100L))
    }

    @Test fun aSolitaryFiveSecondHoldNeverFiresOrPrepares() {
        val policy = FloatingHoldPolicy()
        assertTrue(policy.begin(0L))
        assertEquals(0, sample(policy, 0L, 6_000L))
        assertFalse(policy.release(6_001L))
        assertFalse(policy.prepared(6_001L))
    }

    @Test fun aBriefTapThenFiveContinuousSecondsFireOnlyOnce() {
        val policy = FloatingHoldPolicy()
        prepare(policy)
        assertTrue(policy.begin(200L))
        assertTrue(policy.holding)
        assertEquals(0, sample(policy, 200L, 5_100L))
        assertFalse(policy.poll(5_199L))
        assertTrue(policy.poll(5_200L))
        assertFalse(policy.poll(5_300L))
        assertFalse(policy.release(5_301L))
        assertEquals(30L, policy.cooldownSeconds(5_200L))
    }

    @Test fun releaseBeforeDeadlineRequiresNewTapAndCannotAccumulate() {
        val policy = FloatingHoldPolicy()
        prepare(policy)
        assertTrue(policy.begin(200L))
        assertEquals(0, sample(policy, 200L, 5_100L))
        assertFalse(policy.release(5_199L))
        assertFalse(policy.prepared(5_199L))
        assertTrue(policy.begin(5_200L))
        assertFalse(policy.holding)
        assertEquals(0, sample(policy, 5_200L, 10_500L))
        prepare(policy, 11_000L)
        assertTrue(policy.begin(11_200L))
        assertEquals(1, sample(policy, 11_200L, 16_200L))
    }

    @Test fun preparationExpiresAndLongTapDoesNotPrepare() {
        val policy = FloatingHoldPolicy()
        prepare(policy)
        assertFalse(policy.prepared(4_100L))
        assertTrue(policy.begin(4_100L))
        assertFalse(policy.holding)
        assertFalse(policy.release(4_601L))
        assertFalse(policy.prepared(4_601L))
        assertTrue(policy.begin(5_000L))
        assertTrue(policy.release(5_500L))
        assertTrue(policy.prepared(9_499L))
        assertFalse(policy.prepared(9_500L))
    }

    @Test fun draggingObscurationExtraPointerAndScreenOffCancelBothStages() {
        for (reason in listOf("drag", "obscured", "second pointer", "screen off", "keyguard", "pause", "permission", "detach")) {
            val policy = FloatingHoldPolicy()
            prepare(policy)
            policy.cancel()
            assertFalse(reason, policy.prepared(100L))
            prepare(policy, 1_000L)
            assertTrue(policy.begin(1_200L))
            sample(policy, 1_200L, 6_100L)
            policy.cancel()
            assertFalse(reason, policy.poll(6_200L))
            assertEquals(reason, 0f, policy.progress(6_300L))
        }
    }

    @Test fun cooldownRejectsNewContactsAndPreparationsForThirtySeconds() {
        val policy = FloatingHoldPolicy()
        prepare(policy)
        assertTrue(policy.begin(200L))
        assertEquals(1, sample(policy, 200L, 5_200L))
        assertFalse(policy.begin(5_201L))
        assertFalse(policy.release(5_250L))
        assertFalse(policy.begin(35_199L))
        prepare(policy, 35_200L)
        assertTrue(policy.begin(35_400L))
        assertEquals(1, sample(policy, 35_400L, 40_400L))
    }

    @Test fun stalledUiAndRollbackRequireAFreshTap() {
        val policy = FloatingHoldPolicy()
        prepare(policy)
        assertTrue(policy.begin(200L))
        assertFalse(policy.poll(1_201L))
        assertFalse(policy.poll(5_201L))
        assertFalse(policy.prepared(5_201L))
        prepare(policy, 6_000L)
        assertTrue(policy.begin(6_200L))
        assertFalse(policy.poll(6_300L))
        assertFalse(policy.poll(6_299L))
        assertFalse(policy.poll(11_200L))
    }

    @Test fun repeatedDownCannotReusePreparationOrEarlierHoldTime() {
        val policy = FloatingHoldPolicy()
        prepare(policy)
        assertTrue(policy.begin(200L))
        sample(policy, 200L, 4_200L)
        assertTrue(policy.begin(4_200L))
        assertFalse(policy.holding)
        assertEquals(0, sample(policy, 4_200L, 9_200L))
    }
}
