const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { ConfigStore } = require('../lib/config-store')

function tmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-webapp-launcher-'))
}

test('starts with defaults', async () => {
  const store = new ConfigStore(tmpDir())
  await store.init()
  assert.deepEqual(store.get(), {
    order: [],
    renames: {},
    hidden: [],
    hideDescriptions: true,
    iconSize: 56,
    dayBackground: '#f4f5f7',
    nightBackground: '#14161a',
    themeSource: 'system'
  })
})

test('save merges a partial patch and persists it', async () => {
  const dir = tmpDir()
  const store = new ConfigStore(dir)
  await store.init()

  await store.save({ order: ['b', 'a'] })
  await store.save({ renames: { a: 'Alpha' } })
  await store.save({ hidden: ['c'] })
  await store.save({ hideDescriptions: false })
  await store.save({ iconSize: 80 })
  await store.save({ dayBackground: '#ffffff', nightBackground: '#000000' })
  await store.save({ themeSource: 'signalk' })

  assert.deepEqual(store.get(), {
    order: ['b', 'a'],
    renames: { a: 'Alpha' },
    hidden: ['c'],
    hideDescriptions: false,
    iconSize: 80,
    dayBackground: '#ffffff',
    nightBackground: '#000000',
    themeSource: 'signalk'
  })

  const reloaded = new ConfigStore(dir)
  await reloaded.init()
  assert.deepEqual(reloaded.get(), store.get())
})

test('save drops blank or non-string rename values', async () => {
  const store = new ConfigStore(tmpDir())
  await store.init()
  await store.save({ renames: { a: '  ', b: 42, c: '  Charlie  ' } })
  assert.deepEqual(store.get().renames, { c: 'Charlie' })
})

test('save de-duplicates hidden names and drops non-strings', async () => {
  const store = new ConfigStore(tmpDir())
  await store.init()
  await store.save({ hidden: ['a', 'b', 'a', 42, null] })
  assert.deepEqual(store.get().hidden, ['a', 'b'])
})

test('save clamps iconSize to the allowed range and rounds it', async () => {
  const store = new ConfigStore(tmpDir())
  await store.init()

  await store.save({ iconSize: 12 })
  assert.equal(store.get().iconSize, 32)

  await store.save({ iconSize: 999 })
  assert.equal(store.get().iconSize, 160)

  await store.save({ iconSize: 71.6 })
  assert.equal(store.get().iconSize, 72)

  await store.save({ iconSize: 'nope' })
  assert.equal(store.get().iconSize, 72, 'non-numeric patch leaves the existing value alone')
})

test('save rejects malformed color values, keeping the existing ones', async () => {
  const store = new ConfigStore(tmpDir())
  await store.init()

  await store.save({ dayBackground: '#abc123', nightBackground: '#010203' })
  assert.equal(store.get().dayBackground, '#abc123')
  assert.equal(store.get().nightBackground, '#010203')

  await store.save({ dayBackground: 'red', nightBackground: '#fff' })
  assert.equal(store.get().dayBackground, '#abc123', 'named colors are rejected')
  assert.equal(store.get().nightBackground, '#010203', 'short hex form is rejected')

  await store.save({ dayBackground: '#abc123; } * { display: none' })
  assert.equal(store.get().dayBackground, '#abc123', 'CSS-injection-shaped strings are rejected')
})

test('save rejects an unknown themeSource, keeping the existing one', async () => {
  const store = new ConfigStore(tmpDir())
  await store.init()

  await store.save({ themeSource: 'signalk' })
  assert.equal(store.get().themeSource, 'signalk')

  await store.save({ themeSource: 'nonsense' })
  assert.equal(store.get().themeSource, 'signalk')
})
