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
}
