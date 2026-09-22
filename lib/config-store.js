const fs = require('fs')
const fsp = fs.promises
const path = require('path')
const { atomicWriteJSON } = require('./atomic-write')

const ICON_SIZE_MIN = 32
const ICON_SIZE_MAX = 160
// Matches exactly what a native <input type="color"> produces. Colors only
// ever reach here through that picker or this API, so this is defense in
// depth against a raw API call, not UI-driven validation.
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

const DEFAULT_CONFIG = {
  order: [],
  renames: {},
  hidden: [],
  hideDescriptions: true,
  iconSize: 56,
  dayBackground: '#f4f5f7',
  nightBackground: '#14161a'
}

/** Persists launcher layout (tile order, custom names, hidden apps, description/icon-size/background settings) as one JSON file. */
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
    if (typeof patch.dayBackground === 'string' && HEX_COLOR_PATTERN.test(patch.dayBackground)) {
      next.dayBackground = patch.dayBackground
    }
    if (typeof patch.nightBackground === 'string' && HEX_COLOR_PATTERN.test(patch.nightBackground)) {
      next.nightBackground = patch.nightBackground
    }
    await atomicWriteJSON(this.filePath, next)
    this.config = next
    return next
  }
}

module.exports = { ConfigStore }
