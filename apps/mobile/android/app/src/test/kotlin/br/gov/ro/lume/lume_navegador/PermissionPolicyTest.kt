package br.gov.ro.lume.lume_navegador

import org.junit.Assert.*
import org.junit.Test

class PermissionPolicyTest {
    @Test fun anOptionalUnselectedPermissionIsNotRequiredEvenIfPreviouslyGranted() {
        assertEquals(PermissionPolicy.State.NOT_REQUIRED, PermissionPolicy.state(false, false, false, false))
        assertEquals(PermissionPolicy.State.NOT_REQUIRED, PermissionPolicy.state(false, true, true, false))
    }

    @Test fun grantedPermissionsDoNotRequestAnotherRuntimeDialog() {
        for (asked in listOf(false, true)) for (rationale in listOf(false, true)) {
            assertEquals(PermissionPolicy.State.GRANTED, PermissionPolicy.state(true, true, asked, rationale))
        }
    }

    @Test fun theFirstMissingPermissionMayBeRequestedDespiteNoRationale() {
        assertEquals(PermissionPolicy.State.REQUEST, PermissionPolicy.state(true, false, false, false))
    }

    @Test fun aDenialWithRationaleMayBeRequestedAgainByAnExplicitAction() {
        assertEquals(PermissionPolicy.State.REQUEST, PermissionPolicy.state(true, false, true, true))
    }

    @Test fun aPriorDeniedRequestWithoutRationaleNeedsAnExplicitSettingsAction() {
        assertEquals(PermissionPolicy.State.SETTINGS, PermissionPolicy.state(true, false, true, false))
    }

    @Test fun approximateLocationDoesNotForceThePrecisePermission() {
        assertEquals(PermissionPolicy.State.GRANTED,
            PermissionPolicy.location(PermissionPolicy.State.GRANTED, PermissionPolicy.State.SETTINGS))
        assertEquals(PermissionPolicy.State.GRANTED,
            PermissionPolicy.location(PermissionPolicy.State.REQUEST, PermissionPolicy.State.GRANTED))
    }

    @Test fun groupedLocationCanRequestWhileEitherPermissionRemainsRequestable() {
        assertEquals(PermissionPolicy.State.REQUEST,
            PermissionPolicy.location(PermissionPolicy.State.REQUEST, PermissionPolicy.State.SETTINGS))
        assertEquals(PermissionPolicy.State.REQUEST,
            PermissionPolicy.location(PermissionPolicy.State.SETTINGS, PermissionPolicy.State.REQUEST))
        assertEquals(PermissionPolicy.State.SETTINGS,
            PermissionPolicy.location(PermissionPolicy.State.SETTINGS, PermissionPolicy.State.SETTINGS))
    }
}

class ReservedAccessPolicyTest {
    @Test fun transparentOwnPermissionPauseAndReturnKeepOnlyExistingAccess() {
        val access = ReservedAccessPolicy()
        access.transition(ReservedAccessPolicy.Event.AUTHENTICATED)
        access.transition(ReservedAccessPolicy.Event.OWN_PERMISSION_PAUSE)
        access.transition(ReservedAccessPolicy.Event.PERMISSION_RESULT)
        access.transition(ReservedAccessPolicy.Event.RESUMED)
        assertTrue(access.allowed)
    }

    @Test fun aRuntimePromptCannotCreateAccessForAnUnauthenticatedSession() {
        val access = ReservedAccessPolicy()
        access.transition(ReservedAccessPolicy.Event.OWN_PERMISSION_PAUSE)
        access.transition(ReservedAccessPolicy.Event.PERMISSION_RESULT)
        access.transition(ReservedAccessPolicy.Event.RESUMED)
        assertFalse(access.allowed)
    }

    @Test fun goingHomeOrStoppingDuringPermissionPromptRequiresNewAuthentication() {
        val access = ReservedAccessPolicy()
        access.transition(ReservedAccessPolicy.Event.AUTHENTICATED)
        access.transition(ReservedAccessPolicy.Event.OWN_PERMISSION_PAUSE)
        access.transition(ReservedAccessPolicy.Event.INVALIDATE)
        access.transition(ReservedAccessPolicy.Event.PERMISSION_RESULT)
        access.transition(ReservedAccessPolicy.Event.RESUMED)
        assertFalse(access.allowed)
        access.transition(ReservedAccessPolicy.Event.AUTHENTICATED)
        assertTrue(access.allowed)
    }

    @Test fun recreatedActivityCannotRestoreAccessThroughLatePermissionResults() {
        val destroyed = ReservedAccessPolicy()
        destroyed.transition(ReservedAccessPolicy.Event.AUTHENTICATED)
        destroyed.transition(ReservedAccessPolicy.Event.INVALIDATE)
        destroyed.transition(ReservedAccessPolicy.Event.PERMISSION_RESULT)
        assertFalse(destroyed.allowed)
        val recreated = ReservedAccessPolicy()
        recreated.transition(ReservedAccessPolicy.Event.RESUMED)
        recreated.transition(ReservedAccessPolicy.Event.PERMISSION_RESULT)
        assertFalse(recreated.allowed)
    }

    @Test fun settingsInvalidateAccessBeforeLaunchAndDoNotRestoreItOnReturn() {
        val access = ReservedAccessPolicy()
        access.transition(ReservedAccessPolicy.Event.AUTHENTICATED)
        var launched = false
        access.openSettings { assertFalse(access.allowed); launched = true }
        assertTrue(launched)
        access.transition(ReservedAccessPolicy.Event.RESUMED)
        assertFalse(access.allowed)
    }

    @Test fun failedSettingsLaunchAlsoLeavesAccessInvalidated() {
        val access = ReservedAccessPolicy()
        access.transition(ReservedAccessPolicy.Event.AUTHENTICATED)
        assertThrows(IllegalStateException::class.java) {
            access.openSettings { throw IllegalStateException("settings unavailable") }
        }
        assertFalse(access.allowed)
    }
}
