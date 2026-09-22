// "day" is the only phase/mode treated as day — everything else
// (dawn/sunrise/sunset/dusk/night for environment.sun; anything other than
// "day" for the simpler environment.mode) is treated as night. Mirrors
// signalk-checklist's lib/theme.js SUN_DARK_PHASES: protecting night vision
// from dusk through dawn, not just once it's fully dark.
const SUN_DARK_PHASES = new Set(['dawn', 'sunrise', 'sunset', 'dusk', 'night'])

// app.getSelfPath() may return either the raw value or the full tree node
// ({value, timestamp, $source}) wrapping it, depending on server version.
function unwrapPlainValue (raw) {
  if (raw && typeof raw === 'object' && 'value' in raw) return raw.value
  return raw
}

/**
 * Returns 'day', 'night', or null if the host doesn't support reading
 * paths synchronously, or neither environment.sun nor environment.mode has
 * a recognized value yet. environment.sun (set by signalk-derived-data to
 * one of dawn/sunrise/day/sunset/dusk/night) is preferred for its
 * finer-grained twilight awareness; environment.mode (a simpler day/night
 * string some setups use instead) is the fallback.
 */
function computeDayOrNight (app) {
  if (typeof app.getSelfPath !== 'function') return null

  let sun
  try {
    sun = unwrapPlainValue(app.getSelfPath('environment.sun'))
  } catch (err) {
    sun = undefined
  }
  if (sun === 'day') return 'day'
  if (SUN_DARK_PHASES.has(sun)) return 'night'

  let mode
  try {
    mode = unwrapPlainValue(app.getSelfPath('environment.mode'))
  } catch (err) {
    mode = undefined
  }
  if (typeof mode === 'string') {
    const normalized = mode.toLowerCase()
    if (normalized === 'day') return 'day'
    if (normalized === 'night') return 'night'
  }

  return null
}

module.exports = { computeDayOrNight, SUN_DARK_PHASES, unwrapPlainValue }
