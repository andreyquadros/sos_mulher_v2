package br.gov.ro.lume.lume_navegador

import org.junit.Assert.*
import org.junit.Test

class FloatingHoldPolicyTest {
    private fun sample(policy: FloatingHoldPolicy, from: Long, through: Long): Int {
        var fires = 0
        for (time in from..through step 100L) if (policy.poll(time)) fires++
        return fires
    }

    @Test fun fiveContinuousSecondsAreRequiredAndFireOnlyOnce() {
        val policy = FloatingHoldPolicy()
        assertTrue(policy.begin(0L))
        assertEquals(0, sample(policy, 0L, 4_900L))
        assertFalse(policy.poll(4_999L))
        assertTrue(policy.poll(5_000L))
        assertFalse(policy.poll(5_100L))
        assertEquals(30L, policy.cooldownSeconds(5_000L))
    }

    @Test fun releaseOrCancelBeforeDeadlineCannotBeAccumulatedAcrossContacts() {
        val policy = FloatingHoldPolicy()
        assertTrue(policy.begin(0L))
        sample(policy, 0L, 4_900L)
        policy.cancel()
        assertFalse(policy.poll(5_000L))
        assertTrue(policy.begin(5_001L))
        assertEquals(0f, policy.progress(5_001L))
        assertEquals(0, sample(policy, 5_001L, 9_901L))
        assertTrue(policy.poll(10_001L))
    }

    @Test fun draggingObscurationExtraPointerAndScreenOffAllCancelTheContact() {
        for (reason in listOf("drag", "obscured", "second pointer", "screen off", "keyguard", "pause", "permission")) {
            val policy = FloatingHoldPolicy()
            assertTrue(reason, policy.begin(500L))
            sample(policy, 500L, 5_400L)
            policy.cancel()
            assertFalse(reason, policy.poll(5_500L))
            assertEquals(reason, 0f, policy.progress(6_000L))
        }
    }

    @Test fun cooldownRejectsNewContactsUntilThirtySecondsHaveElapsed() {
        val policy = FloatingHoldPolicy()
        assertTrue(policy.begin(0L))
        assertEquals(1, sample(policy, 0L, 5_000L))
        assertFalse(policy.begin(5_001L))
        assertFalse(policy.begin(34_999L))
        assertTrue(policy.begin(35_000L))
        assertEquals(0, sample(policy, 35_000L, 39_900L))
        assertTrue(policy.poll(40_000L))
    }

    @Test fun stalledUiAndMonotonicRollbackRequireANewContact() {
        val policy = FloatingHoldPolicy()
        assertTrue(policy.begin(0L))
        assertFalse(policy.poll(1_001L))
        assertFalse(policy.poll(5_001L))
        assertTrue(policy.begin(6_000L))
        assertFalse(policy.poll(6_100L))
        assertFalse(policy.poll(6_099L))
        assertFalse(policy.poll(11_000L))
    }

    @Test fun aNewDownCannotReuseTimeFromThePreviousDown() {
        val policy = FloatingHoldPolicy()
        assertTrue(policy.begin(0L))
        sample(policy, 0L, 4_000L)
        assertTrue(policy.begin(4_000L))
        assertEquals(0, sample(policy, 4_000L, 8_900L))
        assertTrue(policy.poll(9_000L))
    }
}
