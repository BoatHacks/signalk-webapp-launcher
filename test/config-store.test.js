const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { ConfigStore } = require('../lib/config-store')

function tmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-launcher-'))
}

test('starts with defaults', async () => {
  const store = new ConfigStore(tmpDir())
  await store.init()
  assert.deepEqual(store.get(), {
    order: [],
    renames: {},
    hidden: [],
    hideDescriptions: true,
    iconSize: 56
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

  assert.deepEqual(store.get(), {
    order: ['b', 'a'],
    renames: { a: 'Alpha' },
    hidden: ['c'],
    hideDescriptions: false,
    iconSize: 80
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
