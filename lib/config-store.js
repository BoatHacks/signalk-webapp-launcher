const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const { atomicWriteJSON } = require('./atomic-write')

const ICON_SIZE_MIN = 32
const ICON_SIZE_MAX = 160

const DEFAULT_CONFIG = {
  order: [],
  renames: {},
  hidden: [],
  hideDescriptions: true,
  iconSize: 56
}

/** Persists launcher layout (tile order, custom names, hidden apps, description/icon-size settings) as one JSON file. */
class ConfigStore {
  constructor (dataDir) {
    this.filePath = path.join(dataDir, 'launcher-config.json')
    this.config = { ...DEFAULT_CONFIG }
  }

  async init () {
    await fsp.mkdir(path.dirname(this.filePath), { recursive: true })
    try {
      const raw = await fsp.readFile(this.filePath, 'utf8')
      this.config = { ...DEFAULT_CONFIG, ...JSON.parse(raw) }
    } catch (err) {
      if (err.code !== 'ENOENT') throw err
    }
  }

  get () {
    return this.config
  }

  /** Merges a partial update (order/renames/hidden/hideDescriptions) into the saved config. */
  async save (patch) {
    const next = { ...this.config }
    if (Array.isArray(patch.order)) {
      next.order = patch.order.filter((name) => typeof name === 'string')
    }
    if (patch.renames && typeof patch.renames === 'object') {
      const renames = {}
      for (const [name, label] of Object.entries(patch.renames)) {
        if (typeof label === 'string' && label.trim()) renames[name] = label.trim().slice(0, 100)
      }
      next.renames = renames
    }
    if (Array.isArray(patch.hidden)) {
      next.hidden = [...new Set(patch.hidden.filter((name) => typeof name === 'string'))]
    }
    if (typeof patch.hideDescriptions === 'boolean') {
      next.hideDescriptions = patch.hideDescriptions
    }
    if (typeof patch.iconSize === 'number' && Number.isFinite(patch.iconSize)) {
      next.iconSize = Math.round(Math.min(ICON_SIZE_MAX, Math.max(ICON_SIZE_MIN, patch.iconSize)))
    }
    await atomicWriteJSON(this.filePath, next)
    this.config = next
    return next
  }
}

module.exports = { ConfigStore }
