package br.gov.ro.lume.lume_navegador

/** A denied first request and an OEM restriction are not distinguishable before request history exists. */
object PermissionPolicy {
    enum class State(val wire: String) {
        GRANTED("granted"), REQUEST("request"), SETTINGS("settings"), NOT_REQUIRED("notRequired")
    }

    fun state(required: Boolean, granted: Boolean, wasRequested: Boolean, showRationale: Boolean): State = when {
        !required -> State.NOT_REQUIRED
        granted -> State.GRANTED
        !wasRequested || showRationale -> State.REQUEST
        else -> State.SETTINGS
    }

    /** Approximate location already satisfies the app's location requirement; precise is optional. */
    fun location(coarse: State, fine: State): State = when {
        coarse == State.GRANTED || fine == State.GRANTED -> State.GRANTED
        coarse == State.REQUEST || fine == State.REQUEST -> State.REQUEST
        else -> State.SETTINGS
    }
}

/** Private access is process-local. Only a successful device credential may establish it. */
class ReservedAccessPolicy {
    enum class Event { AUTHENTICATED, OWN_PERMISSION_PAUSE, RESUMED, PERMISSION_RESULT, INVALIDATE }
    var allowed = false
        private set

    fun transition(event: Event) {
        allowed = when (event) {
            Event.AUTHENTICATED -> true
            Event.INVALIDATE -> false
            Event.OWN_PERMISSION_PAUSE, Event.RESUMED, Event.PERMISSION_RESULT -> allowed
        }
    }

    fun openSettings(launch: () -> Unit) {
        transition(Event.INVALIDATE)
        launch()
    }
}
