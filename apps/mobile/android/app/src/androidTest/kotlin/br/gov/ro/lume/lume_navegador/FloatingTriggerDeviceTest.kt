package br.gov.ro.lume.lume_navegador

import android.Manifest
import android.app.KeyguardManager
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.view.InputDevice
import android.view.MotionEvent
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
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

/** Runs only on the isolated emulator and a DEMO API fixture. No real participant or dispatch. */
@RunWith(AndroidJUnit4::class)
class FloatingTriggerDeviceTest {
    private val instrumentation = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext
    private val automation get() = instrumentation.uiAutomation
    private val device get() = UiDevice.getInstance(instrumentation)
    private fun main(action: () -> Unit) = instrumentation.runOnMainSync(action)
    private fun status(): Map<String, Any?> {
        var result: Map<String, Any?> = emptyMap()
        main { result = ProtectionController.get(context).status() }
        return result
    }
    private fun waitFor(message: String, condition: () -> Boolean) {
        val until = SystemClock.elapsedRealtime() + 30_000L
        while (SystemClock.elapsedRealtime() < until) {
            if (condition()) return
            SystemClock.sleep(100L)
        }
        fail(message)
    }
    private fun shell(command: String): String = automation.executeShellCommand(command).use { descriptor ->
        java.io.FileInputStream(descriptor.fileDescriptor).bufferedReader().readText()
    }
    private fun touch(duration: Long, cancel: Boolean = false) {
        val button = device.findObject(By.desc("Lume · manter pressionado por cinco segundos"))
        assertNotNull("Android must expose the real overlay button", button)
        val bounds = button.visibleBounds
        val x = bounds.exactCenterX(); val y = bounds.exactCenterY()
        val down = SystemClock.uptimeMillis()
        fun inject(action: Int) {
            val event = MotionEvent.obtain(down, SystemClock.uptimeMillis(), action, x, y, 0)
            event.source = InputDevice.SOURCE_TOUCHSCREEN
            try { assertTrue(automation.injectInputEvent(event, true)) } finally { event.recycle() }
        }
        inject(MotionEvent.ACTION_DOWN)
        try { SystemClock.sleep(duration) }
        finally { inject(if (cancel) MotionEvent.ACTION_CANCEL else MotionEvent.ACTION_UP) }
    }
    private fun dragButton() {
        val button = device.findObject(By.desc("Lume · manter pressionado por cinco segundos"))
        assertNotNull(button)
        val bounds = button.visibleBounds
        val x = bounds.centerX(); val y = bounds.centerY()
        assertTrue(device.swipe(x, y, (x - 100).coerceAtLeast(50), y + 80, 50))
        waitFor("Dragging must reposition the overlay without starting another countdown") {
            val moved = device.findObject(By.desc("Lume · manter pressionado por cinco segundos"))?.visibleBounds
            moved != null && (moved.left != bounds.left || moved.top != bounds.top)
        }
    }
    private fun ownIncident(base: String): JSONObject? {
        val pair = ProtectionVault(context).pairing() ?: return null
        val connection = URL("$base/api/devices/me").openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = 5_000; connection.readTimeout = 5_000
            connection.setRequestProperty("Authorization", "Bearer ${pair.getString("deviceToken")}")
            check(connection.responseCode in 200..299) { "DEMO API rejected the device snapshot" }
            return JSONObject(connection.inputStream.bufferedReader().readText()).optJSONObject("activeIncident")
        } finally { connection.disconnect() }
    }

    @Test(timeout = 180_000L) fun overlayTrainingCancelBackgroundAlertAndLifecycle() {
        assumeTrue("Only an isolated emulator is allowed", Build.MODEL.contains("sdk") || Build.FINGERPRINT.contains("emulator"))
        val config = try { JSONObject(instrumentation.context.assets.open("floating-e2e.json").bufferedReader().readText()) }
        catch (_: Exception) { assumeTrue("Use npm run test:android:floating with its private demo fixture", false); return }
        require(config.optBoolean("E2E_FLOATING_TEST"))
        val base = config.getString("API_BASE_URL")
        require(base == "http://10.0.2.2:3001")
        val health = URL("$base/api/health").openConnection() as HttpURLConnection
        health.connectTimeout = 5_000; health.readTimeout = 5_000
        try { require(JSONObject(health.inputStream.bufferedReader().readText()).getBoolean("demoMode")) }
        finally { health.disconnect() }
        val keyguard = context.getSystemService(KeyguardManager::class.java)
        require(!keyguard.isDeviceSecure) { "Use a fresh emulator without a user credential" }
        // Previous lockscreen suites can leave the credential-free AVD on its swipe lockscreen.
        // Never dismiss a credential here: a secure device is rejected above before any UI action.
        device.wakeUp()
        device.pressMenu()
        waitFor("The isolated emulator must be awake and unlocked before testing a visible overlay") {
            !keyguard.isKeyguardLocked && context.getSystemService(PowerManager::class.java).isInteractive
        }
        var activity: android.app.Activity? = null
        try {
            for (permission in listOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.RECORD_AUDIO, Manifest.permission.POST_NOTIFICATIONS)) shell("pm grant ${context.packageName} $permission")
            activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            val paired = CountDownLatch(1)
            var failure: Throwable? = null
            main {
                ProtectionController.get(context).configure(mapOf("baseUrl" to base,
                    "code" to config.getString("E2E_PAIRING_CODE"), "consentLocation" to true, "consentAudio" to true)) {
                    failure = it.exceptionOrNull(); paired.countDown()
                }
            }
            assertTrue(paired.await(30L, TimeUnit.SECONDS))
            failure?.let { throw AssertionError("Fictitious pairing failed", it) }
            main { ProtectionController.get(context).arm() }
            waitFor("The existing foreground session must be active") { status()["armed"] == true }
            shell("appops set ${context.packageName} SYSTEM_ALERT_WINDOW deny")
            main {
                assertThrows(IllegalStateException::class.java) { FloatingTrigger.get(context).startTraining() }
                assertThrows(IllegalStateException::class.java) { FloatingTrigger.get(context).setEnabled(true, true) }
            }
            // System grants are test setup only. The shipping app opens Android Settings and never grants itself access.
            shell("appops set ${context.packageName} SYSTEM_ALERT_WINDOW allow")
            waitFor("Android must recognize the emulator-only overlay grant") { Settings.canDrawOverlays(context) }
            main {
                assertThrows(IllegalStateException::class.java) { FloatingTrigger.get(context).setEnabled(true, false) }
                assertThrows(IllegalStateException::class.java) { FloatingTrigger.get(context).setEnabled(true, true) }
                FloatingTrigger.get(context).startTraining()
            }
            waitFor("Training must display an actual system overlay") { status()["floatingVisible"] == true }
            touch(600L)
            touch(600L, cancel = true)
            dragButton()
            assertEquals(false, status()["floatingTrainingPassed"])
            assertNull(status()["incidentId"])
            touch(5_600L)
            waitFor("Five seconds must pass only the local training") { status()["floatingTrainingPassed"] == true }
            assertEquals(false, status()["floatingVisible"])
            assertEquals(false, status()["floatingEnabled"])
            assertNull(status()["incidentId"])
            assertEquals(0, status()["pendingCount"])
            main { FloatingTrigger.get(context).setEnabled(true, true) }
            shell("appops set ${context.packageName} SYSTEM_ALERT_WINDOW deny")
            waitFor("Permission revocation must remove the window and invalidate its training") {
                status()["floatingVisible"] == false && status()["floatingEnabled"] == false && status()["floatingTrainingPassed"] == false
            }
            assertNotNull(status()["floatingError"])
            assertNull(status()["incidentId"])
            shell("appops set ${context.packageName} SYSTEM_ALERT_WINDOW allow")
            waitFor("Overlay grant must be recognized again") { Settings.canDrawOverlays(context) }
            main { FloatingTrigger.get(context).startTraining() }
            waitFor("A new train is required after permission revocation") { status()["floatingVisible"] == true }
            touch(5_600L)
            waitFor("The repeated local training must pass without an alert") { status()["floatingTrainingPassed"] == true }
            assertNull(status()["incidentId"])
            main { FloatingTrigger.get(context).setEnabled(true, true) }
            device.pressHome()
            waitFor("Overlay must stay visible while the app is in the background") { status()["floatingVisible"] == true }
            device.sleep()
            waitFor("Screen-off removes the overlay") { status()["floatingVisible"] == false }
            assertNull(status()["incidentId"])
            device.wakeUp()
            device.pressMenu()
            waitFor("Unlocking may restore the opted-in button") { status()["floatingVisible"] == true }
            touch(1_000L)
            assertNull(status()["incidentId"])
            touch(5_600L)
            waitFor("A full background hold must preserve an alert") { status()["incidentId"] != null }
            waitFor("The isolated DEMO central must acknowledge the alert") { status()["receivedAt"] != null }
            val id = status()["incidentId"]
            val central = ownIncident(base)
            assertNotNull(central)
            assertEquals("hold", central!!.getString("trigger"))
            assertTrue(central.getBoolean("simulated"))
            assertEquals(id, central.getString("id"))
            assertTrue((status()["floatingCooldownSeconds"] as Long) > 0L)
            dragButton()
            assertTrue("Repositioning must preserve the active cooldown", (status()["floatingCooldownSeconds"] as Long) > 0L)
            assertEquals("Dragging during cooldown cannot create a different incident", id, status()["incidentId"])
            touch(5_600L)
            assertEquals(id, status()["incidentId"])
            main { ProtectionController.get(context).stopSharing() }
            waitFor("Pausing sharing removes and disables the button") { status()["floatingVisible"] == false && status()["floatingEnabled"] == false }
            assertEquals(false, status()["floatingTrainingPassed"])
            assertEquals(true, status()["sharingPaused"])
            assertEquals(id, status()["incidentId"])
        } finally {
            main { FloatingTrigger.get(context).disable(); ProtectionController.get(context).stopSharing() }
            shell("appops set ${context.packageName} SYSTEM_ALERT_WINDOW deny")
            context.stopService(Intent(context, ProtectionService::class.java))
            device.wakeUp()
            main { activity?.finish() }
        }
    }
}
