package br.gov.ro.lume.lume_navegador

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Secrets and queued payloads use an installation key that never leaves Android Keystore. */
class ProtectionVault(context: Context) {
    private val preferences = context.getSharedPreferences("protection_vault", Context.MODE_PRIVATE)
    private val alias = "lume.protection.installation.v1"

    @Synchronized private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }

    fun encrypt(bytes: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        return cipher.iv + cipher.doFinal(bytes)
    }

    fun decrypt(bytes: ByteArray): ByteArray {
        require(bytes.size >= 29) { "Registro local inválido." }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        return cipher.doFinal(bytes.copyOfRange(12, bytes.size))
    }

    fun pairing(): JSONObject? = preferences.getString("pairing", null)?.let {
        JSONObject(String(decrypt(Base64.decode(it, Base64.NO_WRAP)), Charsets.UTF_8))
    }

    fun savePairing(value: JSONObject) {
        check(preferences.edit().putString("pairing", Base64.encodeToString(
            encrypt(value.toString().toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)).commit()) {
            "Não foi possível guardar o vínculo neste aparelho."
        }
    }

    fun revoke() { preferences.edit().remove("pairing").commit() }
}

data class PendingUpload(val id: Long, val kind: String, val eventId: String,
    val sequence: Int, val capturedAt: String, val bytes: ByteArray, val attempts: Int,
    val nextAttempt: Long)

/** SQLite transaction is committed BEFORE the application attempts an alert upload. */
class ProtectionOutbox(context: Context, private val vault: ProtectionVault) :
    SQLiteOpenHelper(context, "protection_outbox.db", null, 2) {
    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE uploads (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, " +
            "event_id TEXT NOT NULL, sequence INTEGER NOT NULL, captured_at TEXT NOT NULL, " +
            "payload BLOB NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0, " +
            "quarantined INTEGER NOT NULL DEFAULT 0, failure_code INTEGER, " +
            "UNIQUE(kind,event_id,sequence))")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE uploads ADD COLUMN quarantined INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE uploads ADD COLUMN failure_code INTEGER")
        }
    }

    @Synchronized fun enqueue(kind: String, eventId: String, sequence: Int,
        capturedAt: String, bytes: ByteArray) {
        val values = ContentValues().apply {
            put("kind", kind); put("event_id", eventId); put("sequence", sequence)
            put("captured_at", capturedAt); put("payload", vault.encrypt(bytes))
        }
        check(writableDatabase.insertWithOnConflict("uploads", null, values,
            SQLiteDatabase.CONFLICT_IGNORE) != -1L || contains(kind, eventId, sequence)) {
            "Não foi possível preservar o alerta no aparelho."
        }
    }

    private fun contains(kind: String, eventId: String, sequence: Int): Boolean =
        readableDatabase.rawQuery("SELECT id FROM uploads WHERE kind=? AND event_id=? AND sequence=?",
            arrayOf(kind, eventId, sequence.toString())).use { it.moveToFirst() }

    @Synchronized fun next(): PendingUpload? = readableDatabase.rawQuery(
        "SELECT id,kind,event_id,sequence,captured_at,payload,attempts,next_attempt FROM uploads WHERE quarantined=0 " +
            "ORDER BY CASE kind WHEN 'incident' THEN 0 WHEN 'escalation' THEN 0 ELSE 1 END,id LIMIT 1", null
    ).use { cursor ->
        if (!cursor.moveToFirst()) null else PendingUpload(cursor.getLong(0), cursor.getString(1),
            cursor.getString(2), cursor.getInt(3), cursor.getString(4),
            vault.decrypt(cursor.getBlob(5)), cursor.getInt(6), cursor.getLong(7))
    }

    @Synchronized fun remove(id: Long) { writableDatabase.delete("uploads", "id=?", arrayOf(id.toString())) }
    @Synchronized fun clearEvent(eventId: String) { writableDatabase.delete("uploads", "event_id=? AND quarantined=0", arrayOf(eventId)) }
    @Synchronized fun quarantine(upload: PendingUpload, code: Int) {
        quarantineWhere("id=?", arrayOf(upload.id.toString()), code)
    }
    @Synchronized fun quarantineEvent(eventId: String, code: Int) {
        quarantineWhere("event_id=?", arrayOf(eventId), code)
    }
    @Synchronized fun quarantineAudio(eventId: String, code: Int) {
        quarantineWhere("event_id=? AND kind='audio'", arrayOf(eventId), code)
    }
    @Synchronized fun quarantineTelemetry(eventId: String) {
        quarantineWhere("event_id=? AND kind IN ('audio','location')", arrayOf(eventId), 409)
    }
    @Synchronized fun archiveIdentity() { quarantineWhere("quarantined=0", emptyArray(), 401) }
    private fun quarantineWhere(where: String, arguments: Array<String>, code: Int) {
        writableDatabase.update("uploads", ContentValues().apply {
            put("quarantined", 1); put("failure_code", code)
        }, where, arguments)
    }
    @Synchronized fun retry(upload: PendingUpload) {
        writableDatabase.update("uploads", ContentValues().apply {
            put("attempts", upload.attempts + 1)
            put("next_attempt", System.currentTimeMillis() + ProtectionPolicy.retryDelay(upload.attempts))
        }, "id=?", arrayOf(upload.id.toString()))
    }
    @Synchronized fun expedite() {
        writableDatabase.update("uploads", ContentValues().apply { put("next_attempt", 0) }, "quarantined=0", null)
    }
    @Synchronized fun count(): Int = readableDatabase.rawQuery("SELECT count(*) FROM uploads WHERE quarantined=0", null)
        .use { it.moveToFirst(); it.getInt(0) }
    @Synchronized fun failedCount(): Int = readableDatabase.rawQuery("SELECT count(*) FROM uploads WHERE quarantined=1", null)
        .use { it.moveToFirst(); it.getInt(0) }
    @Synchronized fun hasPendingEscalation(eventId: String): Boolean = readableDatabase.rawQuery(
        "SELECT id FROM uploads WHERE quarantined=0 AND kind='escalation' AND event_id=? LIMIT 1",
        arrayOf(eventId)).use { it.moveToFirst() }
    @Synchronized fun byteCount(): Long = readableDatabase.rawQuery(
        "SELECT coalesce(sum(length(payload)),0) FROM uploads", null).use { it.moveToFirst(); it.getLong(0) }
}
