const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const { atomicWriteJSON } = require('./atomic-write')

/** True if settings.landingPage currently points at this plugin's own webapp. */
function isLandingPage (settings, pluginId) {
  return settings.landingPage === `/${pluginId}/`
}

/**
 * Returns a new settings object with landingPage set to this plugin's own
 * webapp (enabled) or explicitly '/admin/' (disabled) — never left unset,
 * so disabling always means the ordinary admin console rather than
 * whatever the server's own per-webapp hostname-matching redirect might
 * otherwise pick (see serverroutes.js).
 *
 * Every other key in `settings` is carried over untouched — this is a
 * read-modify-write of the server's own core config file, not a plugin's
 * own sandboxed data, so touching anything beyond the one key it owns
 * would risk clobbering unrelated server configuration.
 */
function withLandingPage (settings, pluginId, enabled) {
  return {
    ...settings,
    landingPage: enabled ? `/${pluginId}/` : '/admin/'
  }
}

/**
 * Reads <configDir>/settings.json and reports whether landingPage is
 * currently this plugin. Throws on missing/malformed JSON — callers must
 * surface that as an error, not treat it as "disabled".
 */
async function getLandingPageStatus (configDir, pluginId) {
  const raw = await fsp.readFile(path.join(configDir, 'settings.json'), 'utf8')
  return isLandingPage(JSON.parse(raw), pluginId)
}

/**
 * Reads, updates, and atomically rewrites <configDir>/settings.json's
 * landingPage. If the file is missing or not valid JSON this throws
 * before anything is written — never silently replaces a broken file
 * with a fresh minimal one, since that would discard the server's real
 * configuration (port, ssl, security config paths, etc).
 *
 * Takes effect on the server's next restart, not immediately: the
 * redirect logic in serverroutes.js reads app.config.settings.landingPage
 * from the in-memory object built once at server startup, not from disk
 * on every request, and mutating that live object from inside a plugin
 * would repeat the same stale-reference trap app.webapps already taught
 * us to avoid (see index.js's getConfigDir comment).
 */
async function setLandingPage (configDir, pluginId, enabled) {
  const settingsPath = path.join(configDir, 'settings.json')
  const raw = await fsp.readFile(settingsPath, 'utf8')
  const settings = JSON.parse(raw)
  const next = withLandingPage(settings, pluginId, enabled)
  await atomicWriteJSON(settingsPath, next)
  return isLandingPage(next, pluginId)
}

module.exports = { isLandingPage, withLandingPage, getLandingPageStatus, setLandingPage }
