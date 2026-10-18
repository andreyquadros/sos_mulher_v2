package br.gov.ro.lume.lume_navegador

import android.Manifest
import android.app.KeyguardManager
import android.app.UiAutomation
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Configurator
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.UUID
import java.io.File

/** Isolated emulator + DEMO API only. Host driver sends kernel hardware events, never app callbacks. */
@RunWith(AndroidJUnit4::class)
class PhysicalTriggerDeviceTest {
    private val driverId = UUID.randomUUID().toString()
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val automation get() = instrumentation.getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
    private fun main(action: () -> Unit) = instrumentation.runOnMainSync(action)
    private fun status(): Map<String, Any?> {
        var result: Map<String, Any?> = emptyMap()
        main { result = ProtectionController.get(context).status() }
        return result
    }
    private fun waitFor(message: String, condition: () -> Boolean) {
        val until = SystemClock.elapsedRealtime() + 30_000
        while (SystemClock.elapsedRealtime() < until) {
            if (condition()) return
            SystemClock.sleep(100)
        }
        fail(message)
    }
    private fun shell(command: String): String = automation.executeShellCommand(command).use { descriptor ->
        java.io.FileInputStream(descriptor.fileDescriptor).bufferedReader().readText()
    }
    private fun sequence(phase: String) {
        // UiAutomation.injectInputEvent bypasses the accessibility input filter on this platform.
        // The isolated host driver instead uses sendevent to send EV_KEY/SYN into the kernel.
        val completed = File(context.cacheDir, "physical-driver-$driverId-$phase")
        completed.delete()
        Log.i("LumePhysicalTest", "driver:$driverId:$phase")
        waitFor("The emulator hardware driver must finish phase $phase") { completed.exists() }
        completed.delete()
        SystemClock.sleep(400)
    }

    private class DemoDevice(private val base: String, private val token: String) {
        fun incident(id: String): JSONObject? {
            val incident = request().optJSONObject("activeIncident")
            return incident?.takeIf { it.optString("id") == id }
        }
        private fun request(): JSONObject {
            val connection = URL("$base/api/devices/me").openConnection() as HttpURLConnection
            try {
                connection.connectTimeout = 5_000; connection.readTimeout = 5_000
                connection.setRequestProperty("Authorization", "Bearer $token")
                check(connection.responseCode in 200..299) { "Demo API HTTP ${connection.responseCode}" }
                return JSONObject(connection.inputStream.bufferedReader().readText())
            } finally { connection.disconnect() }
        }
    }

    @Test(timeout = 180_000) fun lockedBackgroundTrainingAndAlert() {
        Configurator.getInstance().setUiAutomationFlags(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES)
        assumeTrue("Only an isolated emulator is allowed", Build.MODEL.contains("sdk") || Build.FINGERPRINT.contains("emulator"))
        val config = try { JSONObject(instrumentation.context.assets.open("physical-e2e.json").bufferedReader().readText()) }
            catch (_: Exception) { assumeTrue("Run npm run prepare:e2e and copy the private fixture asset first", false); return }
        assumeTrue("Use npm run test:android:physical so kernel events reach accessibility", config.optBoolean("E2E_HARDWARE_DRIVER"))
        val base = config.getString("API_BASE_URL")
        require(base == "http://10.0.2.2:3001")
        val health = URL("$base/api/health").openConnection() as HttpURLConnection
        health.connectTimeout = 5_000; health.readTimeout = 5_000
        try { require(JSONObject(health.inputStream.bufferedReader().readText()).getBoolean("demoMode")) }
        finally { health.disconnect() }
        val manager = context.getSystemService(KeyguardManager::class.java)
        require(!manager.isDeviceSecure) { "Use a fresh emulator with no user credential" }
        val oldServices = shell("settings get secure enabled_accessibility_services").trim()
        val oldEnabled = shell("settings get secure accessibility_enabled").trim()
        var activity: android.app.Activity? = null
        try {
            for (permission in listOf(Manifest.permission.ACCESS_COARSE_LOCATION,
                Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.RECORD_AUDIO,
                Manifest.permission.POST_NOTIFICATIONS)) shell("pm grant ${context.packageName} $permission")
            activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            Log.i("LumePhysicalTest", "activity visible")
            val paired = CountDownLatch(1)
            var failure: Throwable? = null
            main {
                ProtectionController.get(context).configure(mapOf("baseUrl" to base,
                    "code" to config.getString("E2E_PAIRING_CODE"), "consentLocation" to true, "consentAudio" to true)) {
                    failure = it.exceptionOrNull(); paired.countDown()
                }
            }
            assertTrue(paired.await(30, TimeUnit.SECONDS))
            failure?.let { throw AssertionError("Pairing failed", it) }
            Log.i("LumePhysicalTest", "paired")
            main { ProtectionController.get(context).arm() }
            waitFor("FGS must be armed while visible") { status()["armed"] == true }
            Log.i("LumePhysicalTest", "FGS armed")
            // No settings bypass exists in the shipped app. Shell setup belongs only to this isolated test.
            shell("settings put secure enabled_accessibility_services ${context.packageName}/.PhysicalTriggerService")
            shell("settings put secure accessibility_enabled 1")
            waitFor("System must bind the optional service") { status()["physicalConnected"] == true }
            Log.i("LumePhysicalTest", "key service connected")
            main { PhysicalTrigger.get(context).beginTraining() }
            sequence("unlocked") // Correct keys with an unlocked phone cannot establish a lockscreen proof.
            Log.i("LumePhysicalTest", "unlocked training result=${status()["physicalTraining"]}")
            waitFor("Unlocked training must be rejected") { status()["physicalTraining"] == "unlocked" }
            assertNull(status()["incidentId"])
            Log.i("LumePhysicalTest", "unlocked training rejected")
            main { PhysicalTrigger.get(context).cancelTraining(); PhysicalTrigger.get(context).beginTraining() }
            shell("locksettings set-pin 846291")
            require(manager.isDeviceSecure)
            val device = UiDevice.getInstance(instrumentation)
            device.pressHome()
            device.sleep()
            SystemClock.sleep(700)
            device.wakeUp()
            waitFor("Secure keyguard must remain locked") { manager.isKeyguardLocked && manager.isDeviceSecure }
            Log.i("LumePhysicalTest", "secure keyguard locked")
            sequence("short") // Short final hold must not pass training.
            assertEquals("waiting", status()["physicalTraining"])
            SystemClock.sleep(1_700)
            sequence("locked")
            waitFor("Locked training must pass") { status()["physicalTrainedLocked"] == true }
            assertEquals("passed_locked", status()["physicalTraining"])
            assertEquals(false, status()["physicalEnabled"])
            assertNull(status()["incidentId"])
            assertEquals(0, status()["pendingCount"])
            Log.i("LumePhysicalTest", "locked training passed without incident")
            // A test may enable through the coordinator; production calls require a visible Activity and explicit consent.
            main { PhysicalTrigger.get(context).enable(true) }
            assertEquals(true, status()["physicalReady"])
            sequence("alert")
            waitFor("The background key sequence must persist an alert") { status()["incidentId"] != null }
            waitFor("The DEMO server must acknowledge it") { status()["receivedAt"] != null }
            Log.i("LumePhysicalTest", "background alert acknowledged")
            // Inspect only this paired device's own incident; no extra operator login or credentials.
            val central = DemoDevice(base, ProtectionVault(context).pairing()!!.getString("deviceToken"))
            val incidentId = status()["incidentId"] as String
            waitFor("Locked alert must deliver GPS and AAC through the already-armed FGS") {
                val incident = central.incident(incidentId)
                incident != null && !incident.isNull("lastLocation") && incident.optInt("audioCount") > 0
            }
            Log.i("LumePhysicalTest", "GPS and AAC received while locked")
            assertTrue(manager.isKeyguardLocked)
            assertEquals(true, status()["simulated"]) // API demo forces all incidents simulated.
            assertTrue((status()["physicalCooldownSeconds"] as Long) > 0)
            val id = status()["incidentId"]
            main { ProtectionController.get(context).stopSharing() }
            sequence("repeat")
            assertEquals(id, status()["incidentId"])
            assertEquals(true, status()["sharingPaused"]) // Cooldown cannot resume sensors after an immediate repeat.
            assertEquals(0, status()["failedCount"])
            main { ProtectionController.get(context).stopSharing(); PhysicalTrigger.get(context).disable() }
            assertEquals(false, status()["physicalEnabled"])
            assertEquals(false, status()["physicalReady"])
        } finally {
            main { PhysicalTrigger.get(context).disable(); ProtectionController.get(context).stopSharing() }
            shell("locksettings clear --old 846291")
            shell("settings put secure enabled_accessibility_services ${if (oldServices == "null") "''" else oldServices}")
            shell("settings put secure accessibility_enabled ${if (oldEnabled == "null") "0" else oldEnabled}")
            context.stopService(Intent(context, ProtectionService::class.java))
            UiDevice.getInstance(instrumentation).wakeUp()
            main { activity?.finish() }
        }
    }
}
