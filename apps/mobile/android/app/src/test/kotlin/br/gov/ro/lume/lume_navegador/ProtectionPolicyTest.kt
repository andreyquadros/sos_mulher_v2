package br.gov.ro.lume.lume_navegador

import org.junit.Assert.*
import org.junit.Test

class ProtectionPolicyTest {
    @Test fun productionRequiresOriginWithHttpsAndNoCredentials() {
        assertEquals("https://central.example.org", ProtectionPolicy.baseUrl("https://central.example.org/", false))
        for (invalid in listOf("http://central.example.org", "https://user:secret@central.example.org",
            "https://central.example.org/api", "https://central.example.org?token=secret", "not a URL")) {
            assertThrows(IllegalArgumentException::class.java) { ProtectionPolicy.baseUrl(invalid, false) }
        }
    }
    @Test fun debugCleartextIsRestrictedToLoopbackAndEmulator() {
        assertEquals("http://10.0.2.2:3001", ProtectionPolicy.baseUrl("http://10.0.2.2:3001", true))
        assertThrows(IllegalArgumentException::class.java) { ProtectionPolicy.baseUrl("http://192.168.1.2:3001", true) }
        assertThrows(IllegalArgumentException::class.java) { ProtectionPolicy.baseUrl("http://10.0.2.2:3001", false) }
    }
    @Test fun retriesGrowAndHaveFiveMinuteCap() {
        assertEquals(2_000L, ProtectionPolicy.retryDelay(0))
        assertEquals(4_000L, ProtectionPolicy.retryDelay(1))
        assertEquals(300_000L, ProtectionPolicy.retryDelay(50))
    }
    @Test fun permanentValidationFailuresDoNotBecomeInfiniteRetries() {
        for (status in listOf(400, 403, 404, 409, 413, 415, 422)) assertTrue(ProtectionPolicy.permanentFailure(status))
        for (status in listOf(401, 408, 425, 429, 500, 503)) assertFalse(ProtectionPolicy.permanentFailure(status))
    }
    @Test fun archivedOrOrphanedUploadsNeverUseNewSessionIdentity() {
        assertTrue(ProtectionPolicy.uploadBelongsToSession("event-a", "event-a"))
        assertFalse(ProtectionPolicy.uploadBelongsToSession("event-a", "event-b"))
        assertFalse(ProtectionPolicy.uploadBelongsToSession("event-a", null))
    }
    @Test fun realRequestEscalatesActiveExerciseOnlyOnce() {
        assertTrue(ProtectionPolicy.needsEscalation("base-event", true, false, false))
        assertFalse(ProtectionPolicy.needsEscalation("base-event", true, false, true))
        assertFalse(ProtectionPolicy.needsEscalation("base-event", true, true, false))
        assertFalse(ProtectionPolicy.needsEscalation("base-event", false, false, false))
        assertFalse(ProtectionPolicy.needsEscalation(null, true, false, false))
    }
    @Test fun chordRequiresBothButtonsHeldForThreeSecondsAndFiresOnlyOnce() {
        val chord = VolumeChord()
        chord.key(true, true, 0)
        assertFalse(chord.shouldTrigger(10_000))
        chord.key(false, true, 10_000)
        assertFalse(chord.shouldTrigger(12_999))
        assertTrue(chord.shouldTrigger(13_000))
        assertFalse(chord.shouldTrigger(20_000))
        chord.key(false, false, 20_001)
        chord.key(false, true, 20_002)
        assertFalse(chord.shouldTrigger(23_001))
        assertTrue(chord.shouldTrigger(23_002))
    }
    @Test fun releasingOrLosingFocusCancelsChord() {
        val chord = VolumeChord()
        chord.key(true, true, 0); chord.key(false, true, 10)
        chord.key(true, false, 2_000)
        assertFalse(chord.shouldTrigger(5_000))
        chord.key(true, true, 6_000); chord.reset()
        assertFalse(chord.shouldTrigger(20_000))
    }
}
