const path = require('path')
const os = require('os')
const express = require('express')
const { ConfigStore } = require('./lib/config-store')
const { scanWebappMetadata } = require('./lib/webapp-metadata')
const { requireAuth } = require('./lib/auth')

// SignalK's own config-dir default, per the Plugin API docs ("$SIGNALK_NODE_
// CONFIG_DIR, default $HOME/.signalk"). The env var actually set by the
// server is SIGNALK_NODE_CONF_DIR (no "IG"), so we check both spellings
// before falling back to deriving it from getDataDirPath(), which is
// <configDir>/plugin-config-data/<pluginId>.
function getConfigDir (app, dataDir) {
  const fromEnv = process.env.SIGNALK_NODE_CONF_DIR || process.env.SIGNALK_NODE_CONFIG_DIR
  if (fromEnv) return fromEnv
  if (dataDir) return path.resolve(dataDir, '..', '..')
  return path.join(os.homedir(), '.signalk')
}

module.exports = function (app) {
  const plugin = {}

  plugin.id = 'signalk-launcher'
  plugin.name = 'Launcher'
  plugin.description = 'Webapp launcher with reorderable, renameable icons and optional description text'

  plugin.schema = {
    type: 'object',
    properties: {}
  }

  let store
  let webappMetadata = {}

  plugin.start = function () {
    const dataDir = app.getDataDirPath ? app.getDataDirPath() : './data'
    store = new ConfigStore(dataDir)
    store.init().catch((err) => {
      app.error(`signalk-launcher: failed to initialize storage: ${err.message}`)
    })

    // Installed webapps don't change without a server restart, so scanning
    // once here (synchronously — a directory listing plus a handful of
    // small package.json reads, negligible even on a Pi) is enough.
    const configDir = getConfigDir(app, dataDir)
    try {
      webappMetadata = scanWebappMetadata(path.join(configDir, 'node_modules'))
    } catch (err) {
      app.error(`signalk-launcher: failed to scan webapp metadata: ${err.message}`)
    }
  }

  plugin.stop = function () {
    store = undefined
    webappMetadata = {}
  }

  // The server creates a router mounted at /plugins/<plugin.id> and hands it
  // to us here — we add routes onto it directly, we don't create our own.
  plugin.registerWithRouter = function (router) {
    router.use(requireAuth)
    router.use(express.json({ limit: '256kb' }))

    const asyncHandler = (fn) => (req, res) => {
      Promise.resolve(fn(req, res)).catch((err) => {
        app.debug(`signalk-launcher error: ${err.message}`)
        res.status(400).json({ error: err.message })
      })
    }

    // Registering GET routes through router.access('readonly') opens them to
    // readonly users — including the server's built-in AUTO/readonly
    // principal when security.json has allow_readonly set, so viewing the
    // launcher needs no login on a server configured that way. Routes
    // registered directly on `router` stay admin-only. See
    // docs/Developing/Plugins.md "Authentication".
    //
    // The installed-webapps list itself isn't served from here — the
    // `app` object a plugin receives is a one-time shallow copy made while
    // plugins are starting, which runs before the 'webapps' interface has
    // populated app.webapps (interfaces/index.js orders 'plugins' ahead of
    // 'webapps'), so a plugin's app.webapps is permanently empty. The
    // webapp instead calls the already-public GET /signalk/v1/apps/list
    // directly, which reads the real, live app object from serverroutes.js.
    const readonly = router.access('readonly')
    const readwrite = router.access('readwrite')

    // Display name and icon path per installed webapp, scraped from disk
    // in plugin.start() (see getConfigDir/scanWebappMetadata above). Keyed
    // by npm package name, matching the `name` field GET
    // /signalk/v1/apps/list returns for each entry.
    readonly.get('/metadata', (req, res) => {
      res.json(webappMetadata)
    })

    // Not /config — that path is reserved by the server itself, which
    // registers its own GET/POST /config on this router (for the plugin's
    // enabled/configuration state) before handing it to us here.
    readonly.get('/layout', (req, res) => {
      res.json(store.get())
    })

    readwrite.put('/layout', asyncHandler(async (req, res) => {
      const saved = await store.save(req.body || {})
      res.json(saved)
    }))
  }

  return plugin
}
