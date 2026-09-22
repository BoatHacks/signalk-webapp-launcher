const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { scanWebappMetadata } = require('../lib/webapp-metadata')

function writePackage (dir, pkg) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg))
}

test('finds unscoped and scoped signalk-webapp packages, ignores others', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'signalk-launcher-scan-'))

  writePackage(path.join(root, 'signalk-checklist'), {
    name: 'signalk-checklist',
    keywords: ['signalk-node-server-plugin', 'signalk-webapp'],
    signalk: { displayName: 'Checklist', appIcon: './assets/icons/icon-512.png' }
  })
  writePackage(path.join(root, '@signalk', 'freeboard-sk'), {
    name: '@signalk/freeboard-sk',
    keywords: ['signalk-webapp'],
    signalk: { displayName: 'Freeboard-SK', appIcon: './assets/icons/icon-72x72.png' }
  })
  writePackage(path.join(root, 'not-a-webapp'), {
    name: 'not-a-webapp',
    keywords: ['signalk-node-server-plugin']
  })
  writePackage(path.join(root, 'no-signalk-block'), {
    name: 'no-signalk-block',
    keywords: ['signalk-webapp']
  })
  // A directory with no package.json at all shouldn't blow up the scan.
  fs.mkdirSync(path.join(root, 'not-a-package'), { recursive: true })

  const metadata = scanWebappMetadata(root)

  assert.deepEqual(metadata['signalk-checklist'], {
    displayName: 'Checklist',
    appIcon: 'assets/icons/icon-512.png'
  })
  assert.deepEqual(metadata['@signalk/freeboard-sk'], {
    displayName: 'Freeboard-SK',
    appIcon: 'assets/icons/icon-72x72.png'
  })
  assert.deepEqual(metadata['no-signalk-block'], { displayName: null, appIcon: null })
  assert.equal('not-a-webapp' in metadata, false)
  assert.equal('not-a-package' in metadata, false)
})

test('returns an empty object when node_modules does not exist', () => {
  const metadata = scanWebappMetadata('/nonexistent/node_modules')
  assert.deepEqual(metadata, {})
})
