package br.gov.ro.lume.lume_navegador

/** Counts automatic guide presentations independently of pairing and alert data. */
class ProtectionGuideCounter(
    private val readCount: () -> Int,
    private val writeCount: (Int) -> Boolean,
) {
    data class Claim(val show: Boolean, val visit: Int)

    // A session is created only by successful Android credential confirmation.
    // At most three successful claims are retained; no auth grant is persisted.
    private val claimedSessions = mutableMapOf<String, Claim>()

    @Synchronized
    fun claim(session: String): Claim {
        require(session.isNotBlank()) { "Confirme o acesso à área reservada antes de abrir o guia." }
        claimedSessions[session]?.let { return it }
        val current = try {
            readCount().coerceIn(0, MAX_PRESENTATIONS)
        } catch (failure: Exception) {
            throw IllegalStateException("Não foi possível consultar o guia neste aparelho.", failure)
        }
        if (current == MAX_PRESENTATIONS) return Claim(show = false, visit = current)
        val next = current + 1
        val persisted = try {
            writeCount(next)
        } catch (failure: Exception) {
            throw IllegalStateException("Não foi possível salvar a apresentação do guia.", failure)
        }
        check(persisted) { "Não foi possível salvar a apresentação do guia." }
        return Claim(show = true, visit = next).also { claimedSessions[session] = it }
    }

    companion object { const val MAX_PRESENTATIONS = 3 }
}
