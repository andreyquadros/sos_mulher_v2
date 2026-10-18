package br.gov.ro.lume.lume_navegador

import java.text.Normalizer
import java.util.Locale
import kotlin.math.abs

/** Only final recognizer endpoints may be passed to this policy. No audio or transcript is retained. */
data class VoiceWord(val text: String, val confidence: Double, val startSeconds: Double, val endSeconds: Double)
data class VoiceUtterance(
    val text: String,
    val words: List<VoiceWord>,
    val startElapsedMs: Long,
    val endElapsedMs: Long,
)
enum class VoiceDecision { REJECTED, AWAITING_CONFIRMATION, CONFIRMED, COOLDOWN }

/**
 * Two separate exact utterances, never a partial or a substring match. Confidence is an ASR
 * score, not a speaker identity check: a recording/television can reproduce a chosen phrase.
 * Source timestamps prevent callbacks/replays from advancing the confirmation sequence.
 */
class VoicePhrasePolicy(phraseId: String) {
    private val phrase = PHRASES[phraseId] ?: throw IllegalArgumentException("Frase de voz inválida")
    private var pendingEndMs: Long? = null
    private var lastEndMs = -1L
    private var lastNowMs = -1L
    private var cooldownUntilMs = 0L

    fun accept(utterance: VoiceUtterance, nowElapsedMs: Long): VoiceDecision {
        if (nowElapsedMs < 0 || nowElapsedMs < lastNowMs) return reject()
        lastNowMs = nowElapsedMs
        if (nowElapsedMs < cooldownUntilMs) {
            pendingEndMs = null
            return VoiceDecision.COOLDOWN
        }
        if (utterance.startElapsedMs < 0 || utterance.endElapsedMs <= utterance.startElapsedMs ||
            utterance.startElapsedMs <= lastEndMs || utterance.endElapsedMs > nowElapsedMs ||
            nowElapsedMs - utterance.endElapsedMs > MAX_CALLBACK_AGE_MS) return reject()
        lastEndMs = utterance.endElapsedMs
        if (!validPhrase(utterance)) return reject()
        val previous = pendingEndMs
        if (previous == null) {
            pendingEndMs = utterance.endElapsedMs
            return VoiceDecision.AWAITING_CONFIRMATION
        }
        if (utterance.startElapsedMs - previous < MIN_UTTERANCE_GAP_MS ||
            utterance.endElapsedMs - previous > CONFIRMATION_MS) return reject()
        pendingEndMs = null
        cooldownUntilMs = nowElapsedMs + COOLDOWN_MS
        return VoiceDecision.CONFIRMED
    }

    /** Cancels a partial sequence; retains replay guards and the cooldown. */
    fun reset() { pendingEndMs = null }

    fun cooldownRemainingMs(nowElapsedMs: Long): Long =
        (cooldownUntilMs - nowElapsedMs).coerceIn(0L, COOLDOWN_MS)

    private fun reject(): VoiceDecision {
        pendingEndMs = null
        return VoiceDecision.REJECTED
    }

    private fun validPhrase(utterance: VoiceUtterance): Boolean {
        if (normalize(utterance.text) != phrase) return false
        val expected = phrase.split(' ')
        if (utterance.words.size != expected.size) return false
        val speechDuration = utterance.endElapsedMs - utterance.startElapsedMs
        if (speechDuration !in MIN_SPEECH_MS..MAX_SPEECH_MS) return false
        var previousEnd = -1.0
        utterance.words.forEachIndexed { index, word ->
            if (normalize(word.text) != expected[index] || !word.confidence.isFinite() ||
                word.confidence !in MIN_CONFIDENCE..1.0 || !word.startSeconds.isFinite() ||
                !word.endSeconds.isFinite() || word.startSeconds < 0.0 ||
                word.endSeconds - word.startSeconds < MIN_WORD_SECONDS ||
                word.endSeconds - word.startSeconds > MAX_WORD_SECONDS) return false
            if (previousEnd >= 0.0 && (word.startSeconds < previousEnd ||
                    word.startSeconds - previousEnd > MAX_WORD_GAP_SECONDS)) return false
            previousEnd = word.endSeconds
        }
        val reportedDuration = (utterance.words.last().endSeconds - utterance.words.first().startSeconds) * 1000
        return abs(reportedDuration - speechDuration) <= 20.0
    }

    companion object {
        val PHRASES: Map<String, String> = linkedMapOf(
            "estrela_azul" to "minha estrela azul",
            "jardim_luz" to "o jardim precisa de luz",
            "janela_lua" to "a janela da lua",
        )
        const val CONFIRMATION_MS = 12_000L
        const val COOLDOWN_MS = 30_000L
        const val MIN_UTTERANCE_GAP_MS = 400L
        const val MAX_CALLBACK_AGE_MS = 3_000L
        const val MIN_SPEECH_MS = 800L
        const val MAX_SPEECH_MS = 6_000L
        const val MIN_CONFIDENCE = 0.85
        private const val MIN_WORD_SECONDS = 0.04
        private const val MAX_WORD_SECONDS = 1.8
        private const val MAX_WORD_GAP_SECONDS = 1.0

        fun normalize(text: String): String = Normalizer.normalize(text, Normalizer.Form.NFD)
            .replace(Regex("\\p{M}+"), "")
            .lowercase(Locale.ROOT)
            .replace(Regex("[^a-z0-9]+"), " ")
            .trim()
    }
}
