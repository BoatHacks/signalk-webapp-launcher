const fs = require('fs')
const path = require('path')

function readPackageJsonSync (dir) {
  try {
    const raw = fs.readFileSync(path.join(dir, 'package.json'), 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    return null
  }
}

function considerPackage (metadata, dir, name) {
  const pkg = readPackageJsonSync(dir)
  if (!pkg || !Array.isArray(pkg.keywords) || !pkg.keywords.includes('signalk-webapp')) return
  const signalk = pkg.signalk || {}
  metadata[name] = {
    displayName: typeof signalk.displayName === 'string' ? signalk.displayName : null,
    // Relative to the webapp's own served root (its public/ dir), matching
    // the path the server itself serves package files under (/<name>/...).
    appIcon: typeof signalk.appIcon === 'string' ? signalk.appIcon.replace(/^\.\//, '') : null
  }
}

/**
 * Scans <configDir>/node_modules for installed signalk-webapp packages and
 * returns their display metadata keyed by npm package name — the same
 * `name` GET /signalk/v1/apps/list returns for each entry.
 *
 * Reads package.json straight off disk rather than through the plugin's
 * `app.webapps` (see index.js comment): that property is a one-time copy
 * taken before the server's own 'webapps' interface populates it, so it's
 * permanently empty from inside a plugin. This only needs to run once —
 * installed webapps don't change without a server restart.
 */
function scanWebappMetadata (nodeModulesDir) {
  const metadata = {}

  let entries
  try {
    entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true })
  } catch (err) {
    return metadata
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('@')) {
      const scopeDir = path.join(nodeModulesDir, entry.name)
      let scoped
      try {
        scoped = fs.readdirSync(scopeDir, { withFileTypes: true })
      } catch (err) {
        continue
      }
      for (const sub of scoped) {
        if (!sub.isDirectory()) continue
        considerPackage(metadata, path.join(scopeDir, sub.name), `${entry.name}/${sub.name}`)
      }
    } else {
      considerPackage(metadata, path.join(nodeModulesDir, entry.name), entry.name)
    }
  }

  return metadata
}

module.exports = { scanWebappMetadata }
