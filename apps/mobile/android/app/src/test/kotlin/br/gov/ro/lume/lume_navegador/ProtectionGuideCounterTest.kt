package br.gov.ro.lume.lume_navegador

import org.junit.Assert.*
import org.junit.Test

class ProtectionGuideCounterTest {
    private class Store(var count: Int = 0) {
        var writes = 0
        var failWrites = false
        fun counter() = ProtectionGuideCounter(
            readCount = { count },
            writeCount = {
                writes++
                if (failWrites) false else { count = it; true }
            },
        )
    }

    @Test fun firstThreeSessionsClaimAutomaticPresentationAndFourthDoesNot() {
        val store = Store()
        val counter = store.counter()
        for (visit in 1..3) {
            assertEquals(ProtectionGuideCounter.Claim(true, visit), counter.claim("session-$visit"))
        }
        assertEquals(ProtectionGuideCounter.Claim(false, 3), counter.claim("session-4"))
        assertEquals(ProtectionGuideCounter.Claim(false, 3), counter.claim("session-5"))
        assertEquals(3, store.count)
        assertEquals(3, store.writes)
    }

    @Test fun reloadingCounterPreservesDurableLimitAcrossProcessOrAppUpdates() {
        val store = Store()
        for (visit in 1..3) {
            assertEquals(ProtectionGuideCounter.Claim(true, visit), store.counter().claim("session-$visit"))
        }
        assertEquals(ProtectionGuideCounter.Claim(false, 3), store.counter().claim("new-process"))
        assertEquals(3, store.writes)
    }

    @Test fun repeatingSessionReturnsSameDecisionWithoutConsumingAnotherVisit() {
        val store = Store()
        val counter = store.counter()
        val first = counter.claim("authenticated-a")
        repeat(5) { assertEquals(first, counter.claim("authenticated-a")) }
        assertEquals(ProtectionGuideCounter.Claim(true, 2), counter.claim("authenticated-b"))
        assertEquals(first, counter.claim("authenticated-a"))
        assertEquals(2, store.count)
        assertEquals(2, store.writes)
    }

    @Test fun failedCommitNeverGrantsPresentationAndCanRetrySameSession() {
        val store = Store().apply { failWrites = true }
        val counter = store.counter()
        assertThrows(IllegalStateException::class.java) { counter.claim("authenticated") }
        assertEquals(0, store.count)
        store.failWrites = false
        assertEquals(ProtectionGuideCounter.Claim(true, 1), counter.claim("authenticated"))
        assertEquals(1, store.count)
        assertEquals(2, store.writes)
    }

    @Test fun storageExceptionsNeverReturnAnAutomaticPresentation() {
        val unreadable = ProtectionGuideCounter({ throw IllegalStateException("read failed") }, { true })
        val unwritable = ProtectionGuideCounter({ 0 }, { throw IllegalStateException("write failed") })
        assertThrows(IllegalStateException::class.java) { unreadable.claim("authenticated") }
        assertThrows(IllegalStateException::class.java) { unwritable.claim("authenticated") }
    }

    @Test fun countIsCappedWithoutOverflowOrAdditionalWrites() {
        for (persisted in listOf(3, 4, Int.MAX_VALUE)) {
            val store = Store(persisted)
            assertEquals(ProtectionGuideCounter.Claim(false, 3), store.counter().claim("authenticated"))
            assertEquals(0, store.writes)
        }
    }

    @Test fun invalidNegativeCountIsNormalizedAndNeverReturnsOutsidePresentationRange() {
        val store = Store(Int.MIN_VALUE)
        assertEquals(ProtectionGuideCounter.Claim(true, 1), store.counter().claim("authenticated"))
        assertEquals(1, store.count)
    }

    @Test fun missingAuthenticatedSessionDoesNotReadOrWriteStorage() {
        val counter = ProtectionGuideCounter(
            readCount = { fail("Must not read for an invalid session"); 0 },
            writeCount = { fail("Must not write for an invalid session"); false },
        )
        assertThrows(IllegalArgumentException::class.java) { counter.claim("") }
        assertThrows(IllegalArgumentException::class.java) { counter.claim(" ") }
    }
}
