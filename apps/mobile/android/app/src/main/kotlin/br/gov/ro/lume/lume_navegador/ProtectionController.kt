package br.gov.ro.lume.lume_navegador

import android.Manifest
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.Executors

class ProtectionController private constructor(private val context: Context) {
    private val vault = ProtectionVault(context)
    private val outbox = ProtectionOutbox(context, vault)
    private val preferences = context.getSharedPreferences("protection_state", Context.MODE_PRIVATE)
    private val main = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val listeners = CopyOnWriteArraySet<() -> Unit>()
    @Volatile var armed = false
        private set
    private var lastPoll = 0L

    init {
        if (preferences.getBoolean("serviceExpected", false)) {
            error("A sessão anterior parou. Abra o app e reative a proteção.")
        }
        try {
            recoverPendingEvent()
            val connectivity = context.getSystemService(ConnectivityManager::class.java)
            connectivity.registerNetworkCallback(NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(),
                object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) { outbox.expedite(); synchronize() }
                })
            if (outbox.count() > 0) scheduleRetry()
        } catch (_: Exception) { error("Não foi possível recuperar a fila local com segurança.") }
    }

    fun addListener(listener: () -> Unit) { listeners.add(listener) }
    fun removeListener(listener: () -> Unit) { listeners.remove(listener) }
    fun signal() { main.post { listeners.forEach { it() } } }
    fun error(message: String?) { preferences.edit().putString("lastError", message).commit(); signal() }

    private fun pairing(): JSONObject? = try { vault.pairing() } catch (_: Exception) {
        preferences.edit().putString("lastError", "Vínculo local indisponível. Solicite ajuda à equipe responsável.").commit()
        null
    }

    fun requiredPermissions(): Array<String> = buildList {
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        if (pairing()?.optBoolean("consentAudio") == true) add(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
    }.toTypedArray()

    fun hasPermission(permission: String): Boolean = context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
    fun hasLocationPermission(): Boolean = hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION) ||
        hasPermission(Manifest.permission.ACCESS_FINE_LOCATION)
    fun hasAllPermissions(): Boolean = hasLocationPermission() &&
        (!consentAudio() || hasPermission(Manifest.permission.RECORD_AUDIO)) &&
        (Build.VERSION.SDK_INT < 33 || hasPermission(Manifest.permission.POST_NOTIFICATIONS))
    fun canRunLocationSession(): Boolean = hasLocationPermission() && locationEnabled() &&
        (Build.VERSION.SDK_INT < 33 || hasPermission(Manifest.permission.POST_NOTIFICATIONS))
    fun locationEnabled(): Boolean = try {
        val manager = context.getSystemService(LocationManager::class.java)
        manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    } catch (_: Exception) { false }
    fun consentAudio(): Boolean = pairing()?.optBoolean("consentAudio") == true
    fun deviceIdentity(): String? = pairing()?.optString("deviceId")?.takeIf { it.isNotBlank() }
    fun eventId(): String? = preferences.getString("eventId", null)
    fun remoteIncidentId(): String? = preferences.getString("remoteIncidentId", null)
    fun sharingPaused(): Boolean = preferences.getBoolean("sharingPaused", false)

    @Synchronized fun status(): Map<String, Any?> {
        recoverPendingEvent()
        val pair = pairing()
        return mapOf("paired" to (pair != null), "womanName" to pair?.optString("womanName"),
            "armed" to (armed && canRunLocationSession()),
            "incidentId" to (remoteIncidentId() ?: eventId()), "pendingCount" to outbox.count(),
            "failedCount" to outbox.failedCount(),
            "lastError" to preferences.getString("lastError", null),
            "permissionsGranted" to hasAllPermissions(), "consentAudio" to consentAudio(),
            "audioPermissionGranted" to hasPermission(Manifest.permission.RECORD_AUDIO),
            "sharingPaused" to sharingPaused(),
            "simulated" to preferences.getBoolean("simulated", false),
            "escalationPending" to preferences.getBoolean("escalationPending", false),
            "locationEnabled" to locationEnabled(),
            "incidentStatus" to preferences.getString("incidentStatus", null),
            "receivedAt" to preferences.getString("receivedAt", null),
            "acknowledgedAt" to preferences.getString("acknowledgedAt", null),
            "assignedName" to preferences.getString("assignedName", null)) + PhysicalTrigger.get(context).status()
    }

    fun configure(arguments: Map<*, *>, complete: (Result<Map<String, Any?>>) -> Unit) {
        executor.execute {
            val result = runCatching {
                check(eventId() == null && !armed) { "Encerre a ocorrência e a sessão antes de trocar o vínculo." }
                require(arguments["consentLocation"] == true) { "O consentimento de localização é necessário para vincular." }
                val base = ProtectionPolicy.baseUrl(arguments["baseUrl"] as? String ?: "", BuildConfig.DEBUG)
                val code = (arguments["code"] as? String)?.trim().orEmpty()
                require(code.isNotBlank() && code.length <= 128) { "Informe o código fornecido pela central." }
                val audio = arguments["consentAudio"] == true
                val response = request(base, "/devices/pair", "POST", null, JSONObject()
                    .put("code", code).put("consentVersion", "2026-10")
                    .put("consentLocation", true).put("consentAudio", audio).toString().toByteArray())
                require(response.optString("deviceToken").isNotBlank() && response.optString("deviceId").isNotBlank()) {
                    "A central devolveu um vínculo inválido."
                }
                synchronized(this) {
                    // A physical request can arrive while the pairing HTTP request is in flight.
                    check(eventId() == null && !armed) { "Encerre a ocorrência e a sessão antes de trocar o vínculo." }
                    check(PhysicalTrigger.get(context).invalidateIdentity()) { "Não foi possível desativar o atalho anterior." }
                    vault.savePairing(response.put("baseUrl", base).put("consentAudio", audio))
                    preferences.edit().clear().commit()
                    main.post { PhysicalTrigger.get(context).resetIdentity() }
                }
                signal()
                status()
            }.recoverCatching { problem ->
                val safe = when (problem) {
                    is ApiFailure -> "Código inválido, expirado ou indisponível. Gere outro na central."
                    is IOException -> "Não foi possível conectar à central. Confira o endereço e a conexão."
                    else -> problem.message ?: "Não foi possível vincular este aparelho."
                }
                error(safe)
                throw IllegalStateException(safe)
            }
            main.post { complete(result) }
        }
    }

    /** Call only from a currently resumed Activity, after runtime permission grants. */
    fun arm() {
        check(pairing() != null) { "Vincule este aparelho à central primeiro." }
        check(hasLocationPermission() && (Build.VERSION.SDK_INT < 33 || hasPermission(Manifest.permission.POST_NOTIFICATIONS))) {
            "Conceda localização e notificações antes de ativar a sessão. O alerta pode ser enviado sem os sensores."
        }
        check(locationEnabled()) { "Ative a localização do aparelho antes de ativar a proteção." }
        preferences.edit().putBoolean("sharingPaused", false).commit()
        val intent = Intent(context, ProtectionService::class.java)
        if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
    }

    fun disarm() {
        check(eventId() == null) { "A central precisa encerrar a ocorrência antes de desativar a sessão." }
        PhysicalTrigger.get(context).disable()
        context.stopService(Intent(context, ProtectionService::class.java))
        markServiceStopped(null)
    }

    fun markServiceStarted() {
        armed = true
        preferences.edit().putBoolean("serviceExpected", true).remove("lastError").commit()
        if (consentAudio() && !hasPermission(Manifest.permission.RECORD_AUDIO)) {
            error("Microfone sem permissão. A sessão continuará apenas com localização após o alerta.")
        }
        signal()
    }

    fun markServiceStopped(reason: String?) {
        armed = false
        preferences.edit().putBoolean("serviceExpected", false).commit()
        if (reason != null) error(reason) else signal()
    }

    @Synchronized fun trigger(simulated: Boolean, trigger: String, expectedDeviceId: String? = null): Map<String, Any?> {
        val pair = pairing()
        check(pair != null) { "Vincule este aparelho à central primeiro." }
        check(expectedDeviceId == null || pair.optString("deviceId") == expectedDeviceId) {
            "O vínculo mudou. Faça o treino e habilite o atalho novamente."
        }
        require(trigger in setOf("hold", "volume", "notification")) { "Acionamento inválido." }
        preferences.edit().putBoolean("sharingPaused", false).commit()
        if (eventId() == null) {
            val id = UUID.randomUUID().toString()
            val created = utcNow()
            val payload = JSONObject().put("clientEventId", id).put("trigger", trigger)
                .put("simulated", simulated).put("createdAt", created)
            outbox.enqueue("incident", id, 0, created, payload.toString().toByteArray())
            // If the process dies before this commit, recoverPendingEvent restores the durable row.
            check(preferences.edit().putString("eventId", id).putString("incidentStatus", "pending")
                .putBoolean("simulated", simulated).putBoolean("escalationPending", false)
                .remove("remoteIncidentId").remove("receivedAt").remove("acknowledgedAt")
                .remove("assignedName").putInt("locationSequence", 0).putInt("audioSequence", 0)
                .remove("lastError").commit()) { "Alerta preservado; reabra o aplicativo para sincronizar." }
        } else if (ProtectionPolicy.needsEscalation(eventId(), preferences.getBoolean("simulated", false),
            simulated, preferences.getBoolean("escalationPending", false))) {
            val created = utcNow()
            val promotion = JSONObject().put("clientEventId", UUID.randomUUID().toString())
                .put("trigger", trigger).put("simulated", false).put("createdAt", created)
            // Promotion has its own request UUID; telemetry keeps the ORIGINAL base event identity.
            outbox.enqueue("escalation", eventId()!!, sequence("promotion"), created, promotion.toString().toByteArray())
            markEscalationPending()
        }
        outbox.expedite()
        scheduleRetry()
        synchronize()
        main.post { ProtectionService.current?.beginIncident() }
        signal()
        return status()
    }

    @Synchronized fun stopSharing(): Map<String, Any?> {
        check(preferences.edit().putBoolean("sharingPaused", true).commit()) {
            "Não foi possível guardar a interrupção do compartilhamento."
        }
        // MethodChannel/confirmation actions run on the UI thread: stop sensors before returning.
        ProtectionService.current?.endIncident()
        signal()
        return status()
    }

    private fun recoverPendingEvent() {
        if (eventId() == null) {
            val pending = outbox.next() ?: return
            if (pending.kind == "incident") preferences.edit().putString("eventId", pending.eventId)
                .putBoolean("simulated", JSONObject(String(pending.bytes, Charsets.UTF_8)).optBoolean("simulated"))
                .putString("incidentStatus", "pending").commit()
        }
        val active = eventId()
        if (active != null && outbox.hasPendingEscalation(active) &&
            !preferences.getBoolean("escalationPending", false)) markEscalationPending()
    }

    private fun markEscalationPending() {
        preferences.edit().putBoolean("simulated", false).putBoolean("escalationPending", true)
            .putString("incidentStatus", "pending").remove("receivedAt").remove("acknowledgedAt")
            .remove("assignedName").remove("lastError").commit()
    }

    @Synchronized private fun sequence(kind: String): Int {
        val key = "${kind}Sequence"
        val value = preferences.getInt(key, 0) + 1
        check(preferences.edit().putInt(key, value).commit()) { "Falha ao preservar sequência local." }
        return value
    }

    @Synchronized fun location(location: Location) {
        if (sharingPaused()) return
        val event = eventId() ?: return
        if (!location.latitude.isFinite() || !location.longitude.isFinite() ||
            !location.accuracy.isFinite() || location.accuracy < 0) return
        try {
            val seq = sequence("location")
            val captured = utc(location.time)
            val payload = JSONObject().put("sequence", seq).put("latitude", location.latitude)
                .put("longitude", location.longitude).put("accuracy", location.accuracy)
                .put("capturedAt", captured)
            val battery = context.getSystemService(BatteryManager::class.java)
                .getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            if (battery in 0..100) payload.put("battery", battery)
            outbox.enqueue("location", event, seq, captured, payload.toString().toByteArray())
            scheduleRetry(); synchronize(); signal()
        } catch (_: Exception) { error("Falha ao preservar uma atualização de localização no aparelho.") }
    }

    @Synchronized fun audio(bytes: ByteArray, capturedAt: String) {
        val event = eventId() ?: return
        if (!consentAudio() || sharingPaused() || bytes.isEmpty()) return
        if (outbox.byteCount() + bytes.size >= ProtectionPolicy.MAX_OUTBOX_BYTES) {
            error("Armazenamento de áudio pendente cheio. O alerta e a localização continuam.")
            main.post { ProtectionService.current?.pauseAudioForStorage() }
            return
        }
        try {
            check(bytes.size <= 512 * 1024 && outbox.byteCount() + bytes.size < ProtectionPolicy.MAX_OUTBOX_BYTES) {
                "Armazenamento de áudio pendente cheio. O alerta e a localização continuam."
            }
            outbox.enqueue("audio", event, sequence("audio"), capturedAt, bytes)
            scheduleRetry(); synchronize(); signal()
        } catch (problem: Exception) {
            error(problem.message ?: "Não foi possível preservar o bloco de áudio.")
            main.post { ProtectionService.current?.pauseAudio() }
        }
    }

    fun audioStorageRecovered(): Boolean = outbox.byteCount() < ProtectionPolicy.MAX_OUTBOX_BYTES / 2

    fun synchronize(complete: ((Boolean) -> Unit)? = null) {
        executor.execute {
            try {
                val pair = pairing()
                if (pair != null) {
                    if (System.currentTimeMillis() - lastPoll > 10_000) refresh(pair)
                    val started = System.currentTimeMillis()
                    var sent = 0
                    while (sent < 64 && System.currentTimeMillis() - started < 30_000) {
                        val item = outbox.next() ?: break
                        if (item.nextAttempt > System.currentTimeMillis()) break
                        try {
                        val sameSession = synchronized(this) {
                            ProtectionPolicy.uploadBelongsToSession(item.eventId, eventId())
                        }
                        if (!sameSession) {
                            outbox.quarantineEvent(item.eventId, 409)
                            error("Registros de uma sessão anterior foram isolados para revisão; não serão enviados em outra ocorrência.")
                            continue
                        }
                        val incident = remoteIncidentId()
                            if (item.kind !in setOf("incident", "escalation") && incident == null) break
                            val path = when (item.kind) {
                                "incident" -> "/device/incidents"
                                "escalation" -> "/device/incidents"
                                "location" -> "/device/incidents/$incident/locations"
                                "audio" -> "/device/incidents/$incident/audio?sequence=${item.sequence}&capturedAt=" +
                                    URLEncoder.encode(item.capturedAt, "UTF-8")
                                else -> throw IllegalStateException("Tipo de registro local inválido.")
                            }
                            val response = request(pair.getString("baseUrl"), path, "POST",
                                pair.getString("deviceToken"), item.bytes,
                                if (item.kind == "audio") "audio/mp4" else "application/json")
                            if (item.kind == "incident" || item.kind == "escalation") {
                                val serverIncident = response.getJSONObject("incident")
                                synchronized(this) {
                                    saveIncident(serverIncident, confirmedEscalation = item.kind == "escalation")
                                    outbox.remove(item.id)
                                }
                                if (serverIncident.optString("status") == "resolved") {
                                    handleClosedIncident()
                                    if (eventId() == null) break else continue
                                }
                            } else {
                                outbox.remove(item.id)
                            }
                            if (preferences.getString("lastError", null)?.startsWith("Sem confirmação") == true) error(null)
                            sent++
                        } catch (failure: ApiFailure) {
                            if (failure.status == 401) { revoke(); break }
                            if (failure.status == 403 || failure.status == 404 || failure.status == 409) {
                                refresh(pair, force = true)
                                if (eventId() == null) break
                            }
                            if (ProtectionPolicy.permanentFailure(failure.status)) {
                                if (item.kind == "incident") {
                                    if (preferences.getBoolean("escalationPending", false) || outbox.hasPendingEscalation(item.eventId)) {
                                        // An expired/invalid exercise must never swallow a newer valid REAL request.
                                        outbox.quarantine(item, failure.status)
                                        handleClosedIncident()
                                        error("O exercício anterior foi recusado. A solicitação real permanece preservada para envio.")
                                        continue
                                    }
                                    rejectIncident(item.eventId, failure.status)
                                    break
                                }
                                outbox.quarantine(item, failure.status)
                                if (item.kind == "escalation") {
                                    preferences.edit().putBoolean("escalationPending", false).putBoolean("simulated", true).commit()
                                    refresh(pair, force = true)
                                    error("A promoção para ocorrência real foi recusada e preservada em quarentena. Confira com a central e tente novamente.")
                                    continue
                                }
                                error("A central recusou um registro. Ele foi preservado em quarentena; os demais envios continuam.")
                                continue
                            }
                            outbox.retry(item)
                            error("Sem confirmação da central para um envio. O registro permanece na fila.")
                            break
                        } catch (_: IOException) {
                            outbox.retry(item)
                            error("Sem confirmação da central. Alerta e registros preservados para reenvio.")
                            break
                        } catch (_: Exception) {
                            outbox.retry(item)
                            error("A confirmação da central foi inválida. O registro permanece preservado para reenvio.")
                            break
                        }
                    }
                }
            } catch (failure: ApiFailure) {
                if (failure.status != 401) error("Não foi possível sincronizar a fila. Reabra o app e confira o vínculo.")
            } catch (_: Exception) { error("Não foi possível sincronizar a fila. Reabra o app e confira o vínculo.") }
            signal()
            val pending = outbox.count() > 0
            if (pending && pairing() != null) scheduleRetry()
            complete?.invoke(pending && pairing() != null)
        }
    }

    private fun refresh(pair: JSONObject, force: Boolean = false) {
        if (!force && System.currentTimeMillis() - lastPoll < 10_000) return
        lastPoll = System.currentTimeMillis()
        try {
            val data = request(pair.getString("baseUrl"), "/devices/me", "GET", pair.getString("deviceToken"))
            val audio = data.optBoolean("consentAudio", false)
            if (audio != pair.optBoolean("consentAudio")) {
                pair.put("consentAudio", audio); vault.savePairing(pair)
                if (!audio) {
                    eventId()?.let { outbox.quarantineAudio(it, 403) }
                    main.post { ProtectionService.current?.pauseAudio() }
                }
            }
            val active = data.optJSONObject("activeIncident")
            if (remoteIncidentId() != null && active == null) handleClosedIncident()
            else if (active != null && (remoteIncidentId() == null || active.optString("id") == remoteIncidentId())) {
                if (eventId() != null) saveIncident(active)
            }
        } catch (failure: ApiFailure) {
            if (failure.status == 401) { revoke(); throw failure }
        } catch (_: IOException) { /* Outbox retains records; the alert request reports connectivity. */ }
    }

    private fun saveIncident(incident: JSONObject, confirmedEscalation: Boolean = false) {
        if (!confirmedEscalation && preferences.getBoolean("escalationPending", false) && incident.optBoolean("simulated", false)) {
            // A snapshot of the old exercise must not acknowledge a not-yet-delivered real alert.
            preferences.edit().putString("remoteIncidentId", incident.getString("id")).commit()
            return
        }
        val edit = preferences.edit().putString("remoteIncidentId", incident.getString("id"))
            .putString("incidentStatus", incident.getString("status"))
            .putBoolean("simulated", incident.optBoolean("simulated", false))
        // Demo servers may deliberately keep simulated=true even after a real-request POST.
        if (confirmedEscalation || !incident.optBoolean("simulated", false)) edit.putBoolean("escalationPending", false)
        for (key in arrayOf("receivedAt", "acknowledgedAt", "assignedName")) {
            if (incident.isNull(key)) edit.remove(key) else edit.putString(key, incident.optString(key))
        }
        check(edit.commit()) { "Não foi possível guardar a confirmação da central." }
        signal()
    }

    @Synchronized private fun finishIncident() {
        eventId()?.let { outbox.clearEvent(it) }
        preferences.edit().remove("eventId").remove("remoteIncidentId")
            .putString("incidentStatus", "resolved").remove("lastError").remove("sharingPaused")
            .remove("escalationPending").putBoolean("simulated", false).commit()
        main.post { ProtectionService.current?.endIncident() }
        signal()
    }

    @Synchronized private fun handleClosedIncident() {
        val active = eventId()
        if (active != null && (preferences.getBoolean("escalationPending", false) || outbox.hasPendingEscalation(active))) {
            // A remote exercise can close while a REAL request is offline. Its durable promotion must still be sent.
            // Old exercise samples cannot be attached to a newly-created real occurrence.
            outbox.quarantineTelemetry(active)
            preferences.edit().remove("remoteIncidentId").remove("receivedAt").remove("acknowledgedAt")
                .remove("assignedName").putString("incidentStatus", "pending")
                .putBoolean("simulated", false).putBoolean("escalationPending", true).commit()
            signal()
        } else finishIncident()
    }

    @Synchronized private fun rejectIncident(event: String, code: Int) {
        outbox.quarantineEvent(event, code)
        preferences.edit().remove("eventId").remove("remoteIncidentId").remove("receivedAt")
            .remove("escalationPending")
            .putString("incidentStatus", "failed").putBoolean("sharingPaused", true).commit()
        error("A central recusou a criação do alerta. Os registros foram preservados em quarentena; solicite ajuda à equipe responsável.")
        main.post { ProtectionService.current?.endIncident() }
    }

    @Synchronized private fun revoke() {
        // Never attach the previous identity's queue to a later pairing, even for the same participant.
        outbox.archiveIdentity()
        vault.revoke()
        PhysicalTrigger.get(context).invalidateIdentity()
        main.post { PhysicalTrigger.get(context).resetIdentity() }
        preferences.edit().remove("eventId").remove("remoteIncidentId").remove("receivedAt")
            .remove("escalationPending")
            .remove("acknowledgedAt").remove("assignedName").putString("incidentStatus", "revoked")
            .putBoolean("sharingPaused", true).putBoolean("serviceExpected", false).commit()
        armed = false
        error("O vínculo deste aparelho foi revogado. Procure a equipe responsável.")
        main.post {
            context.stopService(Intent(context, ProtectionService::class.java))
            markServiceStopped("O vínculo deste aparelho foi revogado. Procure a equipe responsável.")
        }
    }

    private fun scheduleRetry() {
        if (ProtectionUploadJob.running) return
        try {
            val delay = (outbox.next()?.nextAttempt?.minus(System.currentTimeMillis()) ?: 0L).coerceAtLeast(2_000L)
            context.getSystemService(JobScheduler::class.java).schedule(JobInfo.Builder(7102,
                ComponentName(context, ProtectionUploadJob::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
                .setMinimumLatency(delay).setBackoffCriteria(10_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build())
        } catch (_: Exception) { error("O reenvio em segundo plano não pôde ser agendado. Abra o app para reenviar.") }
    }

    private class ApiFailure(val status: Int) : IOException("A central recusou a solicitação.")

    private fun request(base: String, path: String, method: String, token: String?, bytes: ByteArray? = null,
        mime: String = "application/json"): JSONObject {
        val connection = URL("$base/api$path").openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 8_000; connection.readTimeout = 8_000
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Cache-Control", "no-store")
            if (token != null) connection.setRequestProperty("Authorization", "Bearer $token")
            if (bytes != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", mime)
                connection.setFixedLengthStreamingMode(bytes.size)
                connection.outputStream.use { it.write(bytes) }
            }
            if (connection.responseCode !in 200..299) throw ApiFailure(connection.responseCode)
            val body = connection.inputStream.use { input ->
                val buffer = java.io.ByteArrayOutputStream()
                val block = ByteArray(4096)
                while (true) {
                    val read = input.read(block)
                    if (read < 0) break
                    if (buffer.size() + read > 1024 * 1024) throw IOException("Resposta inválida.")
                    buffer.write(block, 0, read)
                }
                buffer.toString("UTF-8")
            }
            return JSONObject(body)
        } finally { connection.disconnect() }
    }

    companion object {
        @Volatile private var instance: ProtectionController? = null
        fun get(context: Context): ProtectionController = instance ?: synchronized(this) {
            instance ?: ProtectionController(context.applicationContext).also { instance = it }
        }
        fun utcNow(): String = utc(System.currentTimeMillis())
        fun utc(time: Long): String = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
            .apply { timeZone = TimeZone.getTimeZone("UTC") }.format(Date(time))
    }
}
