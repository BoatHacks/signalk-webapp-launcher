const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const fsp = fs.promises
const os = require('os')
const path = require('path')
const {
  isLandingPage,
  withLandingPage,
  getLandingPageStatus,
  setLandingPage
} = require('../lib/landing-page')

function tmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-webapp-launcher-settings-'))
}

test('isLandingPage matches only this exact plugin path', () => {
  assert.equal(isLandingPage({ landingPage: '/signalk-webapp-launcher/' }, 'signalk-webapp-launcher'), true)
  assert.equal(isLandingPage({ landingPage: '/admin/' }, 'signalk-webapp-launcher'), false)
  assert.equal(isLandingPage({}, 'signalk-webapp-launcher'), false)
})

test('withLandingPage sets the plugin path when enabled, /admin/ when not, leaving everything else untouched', () => {
  const settings = { port: 3000, ssl: false, mdns: true }

  const enabled = withLandingPage(settings, 'signalk-webapp-launcher', true)
  assert.equal(enabled.landingPage, '/signalk-webapp-launcher/')
  assert.equal(enabled.port, 3000)
  assert.equal(enabled.ssl, false)
  assert.equal(enabled.mdns, true)

  const disabled = withLandingPage(settings, 'signalk-webapp-launcher', false)
  assert.equal(disabled.landingPage, '/admin/')
  assert.equal(disabled.port, 3000)

  // Original object is untouched (a new object is returned).
  assert.equal(settings.landingPage, undefined)
})

test('withLandingPage disabling always lands on /admin/, never leaves landingPage unset', () => {
  const withExisting = withLandingPage({ landingPage: '/some-other-webapp/' }, 'signalk-webapp-launcher', false)
  assert.equal(withExisting.landingPage, '/admin/')
})

test('setLandingPage reads, rewrites just landingPage, and reports the resulting status', async () => {
  const dir = tmpDir()
  const settingsPath = path.join(dir, 'settings.json')
  await fsp.writeFile(settingsPath, JSON.stringify({ port: 3000, ssl: true }))

  const enabledResult = await setLandingPage(dir, 'signalk-webapp-launcher', true)
  assert.equal(enabledResult, true)
  const afterEnable = JSON.parse(await fsp.readFile(settingsPath, 'utf8'))
  assert.equal(afterEnable.landingPage, '/signalk-webapp-launcher/')
  assert.equal(afterEnable.port, 3000)
  assert.equal(afterEnable.ssl, true)

  assert.equal(await getLandingPageStatus(dir, 'signalk-webapp-launcher'), true)

  const disabledResult = await setLandingPage(dir, 'signalk-webapp-launcher', false)
  assert.equal(disabledResult, false)
  const afterDisable = JSON.parse(await fsp.readFile(settingsPath, 'utf8'))
  assert.equal(afterDisable.landingPage, '/admin/')
  assert.equal(afterDisable.port, 3000, 'unrelated settings survive a second round-trip')
})

test('setLandingPage throws and writes nothing when settings.json is malformed', async () => {
  const dir = tmpDir()
  const settingsPath = path.join(dir, 'settings.json')
  await fsp.writeFile(settingsPath, '{ not valid json')

  await assert.rejects(() => setLandingPage(dir, 'signalk-webapp-launcher', true))

  // The broken file must be left exactly as it was — never replaced with
  // a fresh minimal object, which would discard the server's real config.
  assert.equal(await fsp.readFile(settingsPath, 'utf8'), '{ not valid json')
})

test('setLandingPage throws when settings.json does not exist', async () => {
  const dir = tmpDir()
  await assert.rejects(() => setLandingPage(dir, 'signalk-webapp-launcher', true))
})

test('getLandingPageStatus throws on malformed JSON rather than reporting disabled', async () => {
  const dir = tmpDir()
  await fsp.writeFile(path.join(dir, 'settings.json'), 'not json at all')
  await assert.rejects(() => getLandingPageStatus(dir, 'signalk-webapp-launcher'))
})
