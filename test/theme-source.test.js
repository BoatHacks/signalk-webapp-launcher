const test = require('node:test')
const assert = require('node:assert/strict')
const { computeDayOrNight } = require('../lib/theme-source')

function fakeApp (paths) {
  return {
    getSelfPath: (path) => paths[path]
  }
}

test('prefers environment.sun, treating "day" as day', () => {
  assert.equal(computeDayOrNight(fakeApp({ 'environment.sun': 'day' })), 'day')
})

for (const phase of ['dawn', 'sunrise', 'sunset', 'dusk', 'night']) {
  test(`treats environment.sun "${phase}" as night`, () => {
    assert.equal(computeDayOrNight(fakeApp({ 'environment.sun': phase })), 'night')
  })
}

test('falls back to environment.mode when environment.sun is unrecognized', () => {
  assert.equal(computeDayOrNight(fakeApp({ 'environment.mode': 'day' })), 'day')
  assert.equal(computeDayOrNight(fakeApp({ 'environment.mode': 'NIGHT' })), 'night')
})

test('environment.sun wins over environment.mode when both are present', () => {
  assert.equal(computeDayOrNight(fakeApp({ 'environment.sun': 'day', 'environment.mode': 'night' })), 'day')
})

test('unwraps a {value, timestamp, $source} tree node', () => {
  assert.equal(computeDayOrNight(fakeApp({ 'environment.sun': { value: 'day', timestamp: '2026-01-01' } })), 'day')
})

test('returns null when nothing recognized is available', () => {
  assert.equal(computeDayOrNight(fakeApp({})), null)
  assert.equal(computeDayOrNight(fakeApp({ 'environment.mode': 'twilight' })), null)
})

test('returns null when getSelfPath throws', () => {
  const app = { getSelfPath: () => { throw new Error('not ready') } }
  assert.equal(computeDayOrNight(app), null)
})

test('returns null when the host has no getSelfPath', () => {
  assert.equal(computeDayOrNight({}), null)
})
