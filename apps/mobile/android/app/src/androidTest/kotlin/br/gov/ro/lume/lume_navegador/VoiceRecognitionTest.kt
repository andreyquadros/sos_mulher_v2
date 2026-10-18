package br.gov.ro.lume.lume_navegador

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.vosk.LibVosk
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import kotlin.math.roundToLong

/** Actual native decoder + bundled model, synthetic speech fixtures. No microphone, API or alert. */
@RunWith(AndroidJUnit4::class)
class VoiceRecognitionTest {
    @Test fun bundledPortugueseModelDecodesEndpointsAndAppliesDoublePhrasePolicy() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        val app = instrumentation.targetContext
        val tests = instrumentation.context
        assertTrue(VoiceAudioEngine.modelAvailable(app))
        val manifest = app.assets.open("voice-model-pt/manifest.json").bufferedReader().use { JSONObject(it.readText()) }
        assertEquals(VoiceAudioEngine.MODEL_SHA256, manifest.getString("archiveSha256"))
        val modelDir = File(app.cacheDir, "voice-recognition-fixture-model")
        modelDir.deleteRecursively()
        assertTrue(modelDir.mkdirs())
        try {
            val files = manifest.getJSONArray("files")
            for (index in 0 until files.length()) {
                val info = files.getJSONObject(index)
                val path = info.getString("path")
                val output = File(modelDir, path)
                output.parentFile?.mkdirs()
                app.assets.open("voice-model-pt/$path").use { input -> output.outputStream().use { input.copyTo(it) } }
                assertEquals(info.getString("sha256"), sha256(output.readBytes()))
            }
            LibVosk.vosk_set_log_level(-10)
            Model(modelDir.absolutePath).use { model ->
                val fixtures = tests.assets.open("voice-fixtures/manifest.json").bufferedReader().use { JSONObject(it.readText()) }.getJSONArray("files")
                val decisions = mutableMapOf<String, List<VoiceDecision>>()
                for (index in 0 until fixtures.length()) {
                    val fixture = fixtures.getJSONObject(index)
                    val name = fixture.getString("file")
                    val raw = tests.assets.open("voice-fixtures/$name").use { it.readBytes() }
                    assertEquals(fixture.getString("sha256"), sha256(raw))
                    val pcm = readWav(raw)
                    assertEquals(fixture.getInt("frames") * 2, pcm.size)
                    val policy = VoicePhrasePolicy("estrela_azul")
                    val results = mutableListOf<VoiceDecision>()
                    Recognizer(model, 16000f).use { recognizer ->
                        recognizer.setWords(true) // Production full vocabulary, no phrase grammar.
                        var offset = 0
                        while (offset < pcm.size) {
                            val count = minOf(3200, pcm.size - offset)
                            val chunk = pcm.copyOfRange(offset, offset + count)
                            offset += count
                            if (recognizer.acceptWaveForm(chunk, count)) {
                                val endpoint = JSONObject(recognizer.result)
                                val text = endpoint.optString("text")
                                val array = endpoint.optJSONArray("result")
                                if (text.isBlank() && (array == null || array.length() == 0)) continue
                                assertNotNull("Decoded speech must include word confidence/timing", array)
                                val words = (0 until array!!.length()).map { wordIndex ->
                                    val word = array.getJSONObject(wordIndex)
                                    VoiceWord(word.getString("word"), word.getDouble("conf"), word.getDouble("start"), word.getDouble("end"))
                                }
                                assertTrue(words.isNotEmpty())
                                val base = 1_000_000L
                                val utterance = VoiceUtterance(text, words, base + (words.first().startSeconds * 1000).roundToLong(),
                                    base + (words.last().endSeconds * 1000).roundToLong())
                                val now = base + offset.toLong() * 1000 / 32000
                                results += policy.accept(utterance, now)
                            }
                            chunk.fill(0)
                        }
                    }
                    pcm.fill(0)
                    decisions[name] = results
                }
                assertEquals(listOf(VoiceDecision.AWAITING_CONFIRMATION, VoiceDecision.CONFIRMED), decisions["estrela-twice.wav"])
                assertEquals(listOf(VoiceDecision.AWAITING_CONFIRMATION), decisions["estrela-single.wav"])
                val rejected = decisions["near-and-unrelated.wav"]!!
                assertTrue("Negative speech must yield native endpoints", rejected.isNotEmpty())
                assertFalse(rejected.contains(VoiceDecision.CONFIRMED))
                assertFalse(rejected.contains(VoiceDecision.AWAITING_CONFIRMATION))
            }
        } finally { modelDir.deleteRecursively() }
    }

    private fun sha256(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    private fun readWav(bytes: ByteArray): ByteArray {
        val input = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        assertEquals("RIFF", String(bytes, 0, 4, Charsets.US_ASCII))
        assertEquals("WAVE", String(bytes, 8, 4, Charsets.US_ASCII))
        var offset = 12
        var formatSeen = false
        while (offset + 8 <= bytes.size) {
            val type = String(bytes, offset, 4, Charsets.US_ASCII)
            val length = input.getInt(offset + 4)
            assertTrue(length >= 0 && offset + 8L + length <= bytes.size)
            if (type == "fmt ") {
                assertTrue(length >= 16)
                assertEquals(1, input.getShort(offset + 8).toInt())
                assertEquals(1, input.getShort(offset + 10).toInt())
                assertEquals(16000, input.getInt(offset + 12))
                assertEquals(16, input.getShort(offset + 22).toInt())
                formatSeen = true
            }
            if (type == "data") {
                assertTrue(formatSeen)
                return bytes.copyOfRange(offset + 8, offset + 8 + length)
            }
            offset += 8 + length + (length and 1)
        }
        throw AssertionError("Fixture WAV sem PCM")
    }
}
