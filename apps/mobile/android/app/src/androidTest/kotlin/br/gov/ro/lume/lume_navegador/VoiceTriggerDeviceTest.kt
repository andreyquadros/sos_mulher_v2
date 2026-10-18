package br.gov.ro.lume.lume_navegador

import android.Manifest
import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Intent
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/** Tests actual AudioRecord/model lifecycle under keyguard; no recognizer callbacks are injected. */
@RunWith(AndroidJUnit4::class)
class VoiceTriggerDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private fun main(action: () -> Unit) = instrumentation.runOnMainSync(action)
    private fun shell(command: String): String = instrumentation.uiAutomation.executeShellCommand(command).use {
        java.io.FileInputStream(it.fileDescriptor).bufferedReader().readText()
    }
    private fun status(): Map<String, Any?> {
        var result: Map<String, Any?> = emptyMap()
        main { result = ProtectionController.get(context).status() }
        return result
    }
    private fun waitFor(message: String, condition: () -> Boolean) {
        val until = SystemClock.elapsedRealtime() + 40_000
        while (SystemClock.elapsedRealtime() < until) {
            if (condition()) return
            SystemClock.sleep(100)
        }
        fail(message)
    }
    private fun rejected(action: () -> Unit) {
        var rejected = false
        main { try { action() } catch (_: IllegalStateException) { rejected = true } }
        assertTrue("Explicit authorization/proof must be required", rejected)
    }

    @Test(timeout = 180_000) fun realMicrophoneContinuesWithScreenOffAndStopsOnRequest() {
        assumeTrue("Use an isolated emulator", Build.MODEL.contains("sdk") || Build.FINGERPRINT.contains("emulator"))
        val config = try { JSONObject(instrumentation.context.assets.open("voice-e2e.json").bufferedReader().readText()) }
            catch (_: Exception) { assumeTrue("Use npm run test:android:voice", false); return }
        require(config.optBoolean("E2E_VOICE_LIFECYCLE"))
        val base = config.getString("API_BASE_URL")
        require(base == "http://10.0.2.2:3001")
        val health = URL("$base/api/health").openConnection() as HttpURLConnection
        health.connectTimeout = 5_000; health.readTimeout = 5_000
        try { require(JSONObject(health.inputStream.bufferedReader().readText()).getBoolean("demoMode")) }
        finally { health.disconnect() }
        val keyguard = context.getSystemService(KeyguardManager::class.java)
        require(!keyguard.isDeviceSecure) { "Use a fresh AVD without a user credential" }
        val device = UiDevice.getInstance(instrumentation)
        var activity: android.app.Activity? = null
        try {
            for (permission in listOf(Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.RECORD_AUDIO,
                Manifest.permission.POST_NOTIFICATIONS)) shell("pm grant ${context.packageName} $permission")
            activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            val paired = CountDownLatch(1)
            var failure: Throwable? = null
            main {
                ProtectionController.get(context).configure(mapOf("baseUrl" to base,
                    "code" to config.getString("E2E_PAIRING_CODE"), "consentLocation" to true, "consentAudio" to true)) {
                    failure = it.exceptionOrNull(); paired.countDown()
                }
            }
            assertTrue(paired.await(30, TimeUnit.SECONDS))
            failure?.let { throw AssertionError("Demo pairing failed", it) }
            main { ProtectionController.get(context).arm() }
            waitFor("Visible arm must start foreground service") { status()["armed"] == true }
            assertEquals(true, status()["voiceAvailable"])
            assertEquals(false, status()["voiceListening"])
            shell("locksettings set-pin 846291")
            require(keyguard.isDeviceSecure)
            rejected { VoiceTrigger.get(context).beginTraining("estrela_azul", false) }
            rejected { VoiceTrigger.get(context).enable(true) } // No successful locked training proof.
            assertEquals(false, status()["voiceEnabled"])
            main { VoiceTrigger.get(context).beginTraining("estrela_azul", true) }
            waitFor("Real model and microphone must become ready") { status()["voiceListening"] == true }
            assertEquals("waiting", status()["voiceTraining"])
            assertEquals(false, status()["voiceEnabled"])
            assertEquals(false, status()["voiceReady"])
            device.pressHome()
            device.sleep()
            waitFor("Secure keyguard and display off") {
                keyguard.isKeyguardLocked && !context.getSystemService(PowerManager::class.java).isInteractive
            }
            SystemClock.sleep(6_000)
            assertEquals(true, status()["voiceListening"])
            assertNull(status()["incidentId"])
            assertEquals(0, status()["pendingCount"])
            assertEquals(false, status()["voiceTrainedLocked"])
            val audio = context.getSystemService(AudioManager::class.java)
            assertTrue("The app must have a real active recording session", audio.activeRecordingConfigurations.isNotEmpty())
            val notification = context.getSystemService(NotificationManager::class.java).activeNotifications
                .first { it.id == ProtectionNotifications.SESSION_ID }.notification
            val stop = notification.actions.first { it.title.toString() == "Parar escuta" }
            stop.actionIntent.send()
            waitFor("Notification stop must close microphone without unlocking") { status()["voiceListening"] == false }
            assertTrue(keyguard.isKeyguardLocked)
            assertEquals(false, status()["voiceEnabled"])
            waitFor("AudioRecord must release its session") { audio.activeRecordingConfigurations.isEmpty() }
            assertNull(status()["incidentId"])
            assertEquals(0, status()["pendingCount"])
            // A later Activity/FGS resume never automatically starts a voice session.
            main { ProtectionController.get(context).stopSharing() }
            assertEquals(false, status()["voiceListening"])
            assertEquals(false, status()["voiceReady"])
        } finally {
            main { VoiceTrigger.get(context).disable(); ProtectionController.get(context).stopSharing() }
            shell("locksettings clear --old 846291")
            context.stopService(Intent(context, ProtectionService::class.java))
            device.wakeUp()
            main { activity?.finish() }
        }
    }
}
