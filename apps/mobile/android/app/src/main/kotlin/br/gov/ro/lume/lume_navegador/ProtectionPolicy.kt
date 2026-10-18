package br.gov.ro.lume.lume_navegador

import java.net.URI

/** Pure policy, kept separate so endpoint, retry and physical-trigger rules are JVM testable. */
object ProtectionPolicy {
    const val HOLD_MS = 3_000L
    const val MAX_OUTBOX_BYTES = 40L * 1024 * 1024

    fun baseUrl(value: String, debug: Boolean): String {
        val uri = try { URI(value.trim()) } catch (_: Exception) {
            throw IllegalArgumentException("Endereço da central inválido.")
        }
        require(uri.userInfo == null && uri.query == null && uri.fragment == null &&
            (uri.path.isNullOrEmpty() || uri.path == "/") && !uri.host.isNullOrBlank()) {
            "Informe apenas a origem HTTPS da central, sem caminho ou credenciais."
        }
        val localDebug = debug && uri.scheme == "http" &&
            uri.host in setOf("localhost", "127.0.0.1", "10.0.2.2", "::1", "[::1]")
        require(uri.scheme == "https" || localDebug) { "A central deve usar HTTPS." }
        return uri.toASCIIString().trimEnd('/')
    }

    fun retryDelay(attempt: Int): Long = (2_000L * (1L shl attempt.coerceIn(0, 8)))
        .coerceAtMost(5 * 60_000L)

    /** Authentication invalidation has its own archive/re-pair transition. Other permanent failures never block FIFO. */
    fun permanentFailure(status: Int): Boolean = status in 300..499 && status !in setOf(401, 408, 425, 429)
    fun uploadBelongsToSession(itemEvent: String, activeEvent: String?): Boolean = itemEvent == activeEvent
    fun needsEscalation(activeEvent: String?, currentSimulated: Boolean, requestedSimulated: Boolean,
        alreadyPending: Boolean): Boolean = activeEvent != null && currentSimulated && !requestedSimulated && !alreadyPending
}

class VolumeChord {
    private var up = false
    private var down = false
    private var started: Long? = null
    private var fired = false

    fun key(upKey: Boolean, pressed: Boolean, now: Long) {
        if (upKey) up = pressed else down = pressed
        if (up && down) {
            if (started == null) started = now
        } else {
            started = null
            fired = false
        }
    }

    fun shouldTrigger(now: Long): Boolean {
        val start = started ?: return false
        if (fired || now - start < ProtectionPolicy.HOLD_MS) return false
        fired = true
        return true
    }

    fun reset() { up = false; down = false; started = null; fired = false }
}
