package br.gov.ro.lume.lume_navegador

import org.junit.Assert.*
import org.junit.Test

class VoicePhrasePolicyTest {
    private fun phrase(start: Long = 1000, text: String = "minha estrela azul", confidence: Double = 0.95,
                       duration: Long = 1500): VoiceUtterance {
        val tokens = VoicePhrasePolicy.normalize(text).split(' ')
        val wordSeconds = duration / 1000.0 / tokens.size
        return VoiceUtterance(text, tokens.mapIndexed { index, word ->
            VoiceWord(word, confidence, start / 1000.0 + index * wordSeconds, start / 1000.0 + (index + 1) * wordSeconds)
        }, start, start + duration)
    }
    private fun accept(policy: VoicePhrasePolicy, utterance: VoiceUtterance) = policy.accept(utterance, utterance.endElapsedMs + 1000)

    @Test fun twoSeparateExactEndpointsConfirm() {
        val p = VoicePhrasePolicy("estrela_azul")
        assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(p, phrase()))
        assertEquals(VoiceDecision.CONFIRMED, accept(p, phrase(4000)))
    }
    @Test fun allCatalogPhrasesWorkWithoutSubstringMatching() {
        VoicePhrasePolicy.PHRASES.forEach { (id, text) ->
            val p = VoicePhrasePolicy(id)
            assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(p, phrase(text = text)))
            assertEquals(VoiceDecision.CONFIRMED, accept(p, phrase(4000, text)))
        }
    }
    @Test fun accentsCaseAndWhitespaceNormalize() {
        assertEquals("minha estrela azul", VoicePhrasePolicy.normalize("  MINHA   ESTRÉLA azúl!  "))
        assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(VoicePhrasePolicy("estrela_azul"), phrase(text = "MINHA ESTRÉLA AZUL")))
    }
    @Test fun extraMissingWrongOrRepeatedWordsRejectAndReset() {
        for (text in listOf("minha estrela", "minha estrela azul agora", "a minha estrela azul",
                "minha janela azul", "minha estrela azul minha estrela azul", "[unk]", "", "bom dia")) {
            val p = VoicePhrasePolicy("estrela_azul")
            assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(p, phrase()))
            assertEquals(VoiceDecision.REJECTED, accept(p, phrase(4000, text)))
            assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(p, phrase(7000)))
        }
    }
    @Test fun singlePhraseNeverConfirms() {
        assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(VoicePhrasePolicy("estrela_azul"), phrase()))
    }
    @Test fun everyWordMustMeetConfidenceThreshold() {
        for (low in listOf(0.84999, 0.0, -1.0, 1.01, Double.NaN, Double.POSITIVE_INFINITY)) {
            val p = VoicePhrasePolicy("estrela_azul")
            assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(p, phrase()))
            val next = phrase(4000).let { it.copy(words = it.words.toMutableList().apply { this[1] = this[1].copy(confidence = low) }) }
            assertEquals(VoiceDecision.REJECTED, accept(p, next))
            assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(p, phrase(7000)))
        }
        assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(VoicePhrasePolicy("estrela_azul"), phrase(confidence = 0.85)))
    }
    @Test fun callbackReplayAndOverlappingSpeechReject() {
        for (next in listOf(phrase(), phrase(2000), phrase(2500))) {
            val p = VoicePhrasePolicy("estrela_azul")
            accept(p, phrase())
            assertEquals(VoiceDecision.REJECTED, p.accept(next, 6000))
        }
    }
    @Test fun minimumPauseIsRequiredBetweenEndpoints() {
        val p = VoicePhrasePolicy("estrela_azul")
        accept(p, phrase())
        assertEquals(VoiceDecision.REJECTED, accept(p, phrase(2899)))
        val other = VoicePhrasePolicy("estrela_azul")
        accept(other, phrase())
        assertEquals(VoiceDecision.CONFIRMED, accept(other, phrase(2900)))
    }
    @Test fun deadlineUsesSourceEndNotCallbackArrival() {
        val p = VoicePhrasePolicy("estrela_azul")
        accept(p, phrase())
        assertEquals(VoiceDecision.CONFIRMED, p.accept(phrase(13000), 15500))
        val expired = VoicePhrasePolicy("estrela_azul")
        accept(expired, phrase())
        assertEquals(VoiceDecision.REJECTED, accept(expired, phrase(13001)))
        assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(expired, phrase(16000)))
    }
    @Test fun delayedOrFutureCallbacksReject() {
        for (now in listOf(2499L, 5501L))
            assertEquals(VoiceDecision.REJECTED, VoicePhrasePolicy("estrela_azul").accept(phrase(), now))
        assertEquals(VoiceDecision.AWAITING_CONFIRMATION, VoicePhrasePolicy("estrela_azul").accept(phrase(), 5500))
    }
    @Test fun backwardClockRejectsAndCancelsPending() {
        val p = VoicePhrasePolicy("estrela_azul")
        accept(p, phrase())
        assertEquals(VoiceDecision.REJECTED, p.accept(phrase(4000), 3000))
        assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(p, phrase(7000)))
    }
    @Test fun cooldownPersistsAcrossResetAndExpiresOnElapsedClock() {
        val p = VoicePhrasePolicy("estrela_azul")
        accept(p, phrase())
        assertEquals(VoiceDecision.CONFIRMED, p.accept(phrase(4000), 6000))
        p.reset()
        assertEquals(30000L, p.cooldownRemainingMs(6000))
        assertEquals(VoiceDecision.COOLDOWN, accept(p, phrase(7000)))
        assertEquals(1L, p.cooldownRemainingMs(35999))
        assertEquals(VoiceDecision.AWAITING_CONFIRMATION, p.accept(phrase(34000), 36000))
        assertEquals(0L, p.cooldownRemainingMs(36000))
    }
    @Test fun resetCancelsFirstPhraseWithoutClearingReplayGuard() {
        val p = VoicePhrasePolicy("estrela_azul")
        accept(p, phrase())
        p.reset()
        assertEquals(VoiceDecision.AWAITING_CONFIRMATION, accept(p, phrase(4000)))
    }
    @Test fun durationBoundsAndBadWordTimesReject() {
        for (duration in listOf(799L, 6001L))
            assertEquals(VoiceDecision.REJECTED, accept(VoicePhrasePolicy("estrela_azul"), phrase(duration = duration)))
        val original = phrase()
        val invalid = listOf(
            original.copy(startElapsedMs = -1), original.copy(endElapsedMs = 1000),
            original.copy(words = emptyList()), original.copy(words = original.words.dropLast(1)),
            original.copy(words = original.words.map { it.copy(startSeconds = Double.NaN) }),
            original.copy(words = original.words.map { it.copy(endSeconds = Double.POSITIVE_INFINITY) }),
            original.copy(words = original.words.map { it.copy(startSeconds = -1.0) }),
            original.copy(words = original.words.map { it.copy(endSeconds = it.startSeconds + 0.02) }),
            original.copy(words = original.words.map { it.copy(endSeconds = it.startSeconds + 1.9) }),
            original.copy(words = original.words.map { it.copy(text = "errado") }), original.copy(endElapsedMs = 2800),
        )
        invalid.forEach { assertEquals(VoiceDecision.REJECTED, accept(VoicePhrasePolicy("estrela_azul"), it)) }
    }
    @Test fun shuffledOrOverlappingWordsReject() {
        val original = phrase()
        val overlap = original.copy(words = original.words.toMutableList().apply { this[1] = this[1].copy(startSeconds = 1.2) })
        val hugeGap = original.copy(words = original.words.toMutableList().apply { this[2] = this[2].copy(startSeconds = 3.5, endSeconds = 4.0) }, endElapsedMs = 4000)
        for (bad in listOf(overlap, hugeGap, original.copy(words = original.words.reversed())))
            assertEquals(VoiceDecision.REJECTED, accept(VoicePhrasePolicy("estrela_azul"), bad))
    }
    @Test fun randomUnrelatedEndpointsNeverConfirm() {
        val p = VoicePhrasePolicy("estrela_azul")
        val random = java.util.Random(846291)
        val words = listOf("minha", "estrela", "azul", "jardim", "amarelo", "notícias", "bom", "dia")
        repeat(2000) { index ->
            val text = (0 until 1 + random.nextInt(6)).joinToString(" ") { words[random.nextInt(words.size)] }
            assertNotEquals(VoiceDecision.CONFIRMED, accept(p, phrase(1000L + index * 4000L, text)))
        }
    }
    @Test(expected = IllegalArgumentException::class) fun unknownPhraseCannotBeEnabled() { VoicePhrasePolicy("custom") }
}
