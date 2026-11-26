package br.gov.ro.lume.lume_navegador

import org.junit.Assert.*
import org.junit.Test

class ProtectionPolicyTest {
    @Test fun feedbackRequiresARecentSuccessfulPollAndMatchingResolution() {
        assertTrue(ProtectionPolicy.feedbackIsStale(-1L, 100L))
        assertTrue(ProtectionPolicy.feedbackIsStale(200L, 199L))
        assertFalse(ProtectionPolicy.feedbackIsStale(200L, 30_200L))
        assertTrue(ProtectionPolicy.feedbackIsStale(200L, 30_201L))
        assertTrue(ProtectionPolicy.resolvedFeedbackMatches("case-a", "case-a", "resolved"))
        assertFalse(ProtectionPolicy.resolvedFeedbackMatches("case-a", "case-b", "resolved"))
        assertFalse(ProtectionPolicy.resolvedFeedbackMatches("case-a", "case-a", "new"))
        assertFalse(ProtectionPolicy.resolvedFeedbackMatches(null, null, "resolved"))
    }
    @Test fun devicePollingUsesMonotonicDeadlinesAndPollsImmediatelyAfterReset() {
        assertTrue(ProtectionPolicy.devicePollDue(-1L, 0L))
        assertFalse(ProtectionPolicy.devicePollDue(100L, 10_099L))
        assertTrue(ProtectionPolicy.devicePollDue(100L, 10_100L))
        assertTrue(ProtectionPolicy.devicePollDue(10_000L, 100L))
    }
    @Test fun hapticFeedbackRequiresHumanAcknowledgementOfALiveRealIncident() {
        assertNull(ProtectionPolicy.acknowledgementFeedbackKey("case", null, false, "new"))
        assertNull(ProtectionPolicy.acknowledgementFeedbackKey("case", "", false, "assigned"))
        assertNull(ProtectionPolicy.acknowledgementFeedbackKey("case", "2026-11-26T13:00:00Z", true, "assigned"))
        assertNull(ProtectionPolicy.acknowledgementFeedbackKey("case", "2026-11-26T13:00:00Z", false, "resolved"))
        val key = ProtectionPolicy.acknowledgementFeedbackKey("case", "2026-11-26T13:00:00Z", false, "assigned")
        assertEquals("case:2026-11-26T13:00:00Z", key)
        assertEquals(key, ProtectionPolicy.acknowledgementFeedbackKey("case", "2026-11-26T13:00:00Z", false, "new"))
    }
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
