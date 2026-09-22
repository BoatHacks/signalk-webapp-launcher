(function () {
  const API = '/plugins/signalk-webapp-launcher'
  const PLUGIN_NAME = 'signalk-webapp-launcher'

  const grid = document.getElementById('grid')
  const hiddenSection = document.getElementById('hidden-section')
  const hiddenGrid = document.getElementById('hidden-grid')
  const emptyState = document.getElementById('empty-state')
  const editToggle = document.getElementById('edit-toggle')
  const showDescriptionsControl = document.getElementById('show-descriptions-control')
  const showDescriptions = document.getElementById('show-descriptions')
  const iconSizeControl = document.getElementById('icon-size-control')
  const iconSizeSlider = document.getElementById('icon-size-slider')
  const iconSizeNumber = document.getElementById('icon-size-number')
  const dayBgControl = document.getElementById('day-bg-control')
  const dayBgColor = document.getElementById('day-bg-color')
  const nightBgControl = document.getElementById('night-bg-control')
  const nightBgColor = document.getElementById('night-bg-color')
  const themeSourceControl = document.getElementById('theme-source-control')
  const themeSourceSelect = document.getElementById('theme-source-select')
  const themeSourceStatus = document.getElementById('theme-source-status')
  const header = document.querySelector('header')
  const loginRedirect = document.getElementById('login-redirect')

  const SUN_POLL_INTERVAL_MS = 60000

  let webapps = []
  let config = {
    order: [],
    renames: {},
    hidden: [],
    hideDescriptions: true,
    iconSize: 56,
    dayBackground: '#f4f5f7',
    nightBackground: '#14161a',
    themeSource: 'system'
  }
  let editMode = false
  let iconSizeSaveTimer = null
  let dayBgSaveTimer = null
  let nightBgSaveTimer = null
  let sunPhase = null
  let sunPollTimer = null

  // Thrown on a 401. Reads are registered server-side via router.access
  // ('readonly'), so with allow_readonly on they work with no session at
  // all; this only fires for an edit on a server that requires a real
  // login. Per the SignalK webapp docs' "Redirecting unauthenticated users
  // to login", the documented handoff is to the admin UI's own login
  // screen with a return path — not a webapp-local login form. Cookie
  // sessions are shared across all webapps, so logging in there covers
  // this page too.
  class AuthRequiredError extends Error {}

  function redirectToLogin () {
    header.hidden = true
    grid.innerHTML = ''
    emptyState.hidden = true
    loginRedirect.hidden = false
    const here = window.location.pathname + window.location.search + window.location.hash
    window.location.href = '/admin/#/login?redirect=' + encodeURIComponent(here)
  }

  async function fetchJSON (url, options) {
    const res = await fetch(url, { credentials: 'include', ...options })
    if (res.status === 401) throw new AuthRequiredError('authentication required')
    if (!res.ok) throw new Error(`${url}: ${res.status}`)
    return res.json()
  }

  // Installed webapps come from the server's own public, unauthenticated
  // list rather than a route on this plugin — see the comment in index.js
  // on why app.webapps isn't usable from inside a plugin. That endpoint
  // only has name/description/location (no signalk.displayName/appIcon),
  // so the nice name and icon path come from our own /metadata route,
  // which scrapes each installed webapp's package.json off disk.
  async function loadWebapps () {
    const [apps, metadata] = await Promise.all([
      fetchJSON('/signalk/v1/apps/list'),
      fetchJSON(`${API}/metadata`)
    ])
    return apps
      .filter((w) => w.name !== PLUGIN_NAME)
      .map((w) => {
        const meta = metadata[w.name] || {}
        return {
          name: w.name,
          label: meta.displayName || w.name,
          description: w.description || '',
          location: w.location,
          icon: meta.appIcon ? `/${w.name}/${meta.appIcon}` : null
        }
      })
  }

  async function load () {
    try {
      const [apps, cfg] = await Promise.all([
        loadWebapps(),
        fetchJSON(`${API}/layout`)
      ])
      webapps = apps
      config = cfg
      showDescriptions.checked = !config.hideDescriptions
      applyIconSize(config.iconSize)
      iconSizeSlider.value = config.iconSize
      iconSizeNumber.value = config.iconSize
      dayBgColor.value = config.dayBackground
      nightBgColor.value = config.nightBackground
      themeSourceSelect.value = config.themeSource
      applyBackgroundColor()
      if (config.themeSource === 'signalk') startSunPolling()
      render()
    } catch (err) {
      if (err instanceof AuthRequiredError) return redirectToLogin()
      throw err
    }
  }

  async function saveConfig (patch) {
    try {
      config = await fetchJSON(`${API}/layout`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch)
      })
    } catch (err) {
      if (err instanceof AuthRequiredError) return redirectToLogin()
      throw err
    }
  }

  /** Known order first (only entries still installed), then any newly-installed apps appended. */
  function orderedWebapps () {
    const byName = new Map(webapps.map((w) => [w.name, w]))
    const ordered = []
    const seen = new Set()
    for (const name of config.order) {
      const w = byName.get(name)
      if (w) {
        ordered.push(w)
        seen.add(name)
      }
    }
    for (const w of webapps) {
      if (!seen.has(w.name)) ordered.push(w)
    }
    return ordered
  }

  function makeIcon (webapp) {
    if (webapp.icon) {
      const img = document.createElement('img')
      img.className = 'icon'
      img.src = webapp.icon
      img.alt = ''
      img.onerror = () => img.replaceWith(makeFallbackIcon(webapp))
      return img
    }
    return makeFallbackIcon(webapp)
  }

  function makeFallbackIcon (webapp) {
    const div = document.createElement('div')
    div.className = 'icon-fallback'
    div.textContent = (webapp.label || webapp.name || '?').trim().charAt(0).toUpperCase()
    return div
  }

  function commitRename (webapp, labelEl) {
    const original = webapp.label
    const value = labelEl.textContent.trim()
    const renames = { ...config.renames }
    if (!value || value === original) {
      delete renames[webapp.name]
      labelEl.textContent = original
    } else {
      renames[webapp.name] = value
    }
    saveConfig({ renames }).catch((err) => console.error('signalk-webapp-launcher: save failed', err))
  }

  function applyIconSize (px) {
    document.documentElement.style.setProperty('--icon-size', `${px}px`)
  }

  // "Day"/"night" defaults to the system's own light/dark setting, matching
  // the dark-mode split style.css already uses for every other color, just
  // made user-configurable for this one instead of hardcoded. Setting the
  // inline style always wins over the stylesheet's @media block, so no
  // specificity fight like the one the [hidden] toolbar controls had.
  //
  // themeSource === 'signalk' switches the *source* of day-vs-night to the
  // boat's own environment.sun/environment.mode (see docs/
  // auto-day-night-source.md) instead of the device's OS setting — useful
  // on kiosk/helm displays that have no OS dark-mode toggle at all, or one
  // that doesn't track actual time of day. The two saved colors themselves
  // are unaffected either way; only which one is currently shown changes.
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')

  function applyBackgroundColor () {
    let isNight
    if (config.themeSource === 'signalk') {
      if (sunPhase === null) return // no data yet — leave the current color alone
      isNight = sunPhase === 'night'
    } else {
      isNight = darkModeQuery.matches
    }
    document.documentElement.style.setProperty('--bg', isNight ? config.nightBackground : config.dayBackground)
  }

  darkModeQuery.addEventListener('change', applyBackgroundColor)

  async function pollSunPhase () {
    try {
      const { phase } = await fetchJSON(`${API}/sun-phase`)
      sunPhase = phase
      themeSourceStatus.hidden = phase !== null
      applyBackgroundColor()
    } catch (err) {
      if (err instanceof AuthRequiredError) return redirectToLogin()
      console.error('signalk-webapp-launcher: sun-phase poll failed', err)
    }
  }

  function startSunPolling () {
    if (sunPollTimer !== null) return
    pollSunPhase()
    sunPollTimer = setInterval(pollSunPhase, SUN_POLL_INTERVAL_MS)
  }

  function stopSunPolling () {
    clearInterval(sunPollTimer)
    sunPollTimer = null
    sunPhase = null
    themeSourceStatus.hidden = true
  }

  // Same live-apply-now, save-after-a-pause split as onIconSizeInput — some
  // browsers' native color pickers fire 'input' continuously while dragging
  // inside the swatch. Day and night each get their own timer so adjusting
  // one right after the other can't cancel the other's pending save.
  function onBackgroundColorInput (which, value) {
    const field = which === 'day' ? 'dayBackground' : 'nightBackground'
    config[field] = value
    applyBackgroundColor()
    if (which === 'day') clearTimeout(dayBgSaveTimer)
    else clearTimeout(nightBgSaveTimer)
    const timer = setTimeout(() => {
      saveConfig({ [field]: value }).catch((err) => console.error('signalk-webapp-launcher: save failed', err))
    }, 300)
    if (which === 'day') dayBgSaveTimer = timer
    else nightBgSaveTimer = timer
  }

  // Applies immediately for live feedback while dragging/typing, but only
  // persists after a short pause so a slider drag doesn't fire a save per
  // pixel. The server clamps/rounds too (see lib/config-store.js); this
  // just keeps the round-trip from spamming the plugin's data file.
  function onIconSizeInput (rawValue) {
    const value = Math.min(160, Math.max(32, Math.round(Number(rawValue) || config.iconSize)))
    iconSizeSlider.value = value
    iconSizeNumber.value = value
    config.iconSize = value
    applyIconSize(value)
    clearTimeout(iconSizeSaveTimer)
    iconSizeSaveTimer = setTimeout(() => {
      saveConfig({ iconSize: value }).catch((err) => console.error('signalk-webapp-launcher: save failed', err))
    }, 300)
  }

  function toggleHidden (webapp) {
    const hiddenSet = new Set(config.hidden)
    if (hiddenSet.has(webapp.name)) hiddenSet.delete(webapp.name)
    else hiddenSet.add(webapp.name)
    const hidden = [...hiddenSet]
    saveConfig({ hidden })
      .then(() => render())
      .catch((err) => console.error('signalk-webapp-launcher: save failed', err))
  }

  // Reordering uses Pointer Events rather than the HTML5 Drag and Drop API
  // (draggable/dragstart/dragover/drop): iOS/iPadOS Safari never fires drag
  // events for touch input, only for a mouse, so the old implementation
  // silently did nothing on an iPad. Pointer Events cover mouse, touch and
  // pen uniformly and iPadOS Safari supports them.
  let dragState = null
  let dragGhost = null

  // A floating, semi-transparent copy of the icon that follows the
  // pointer — without it, the only feedback during a drag was the
  // original tile's own opacity dropping in place, which is easy to miss
  // (your finger is covering it) and gives no sense of "something is being
  // dragged" until it actually jumps to a new slot. pointer-events: none
  // is required, not optional: without it the ghost itself would be the
  // element document.elementFromPoint finds under the finger in
  // onDragMove, and drop-target detection would break.
  function createDragGhost (tile, e) {
    const source = tile.querySelector('.icon, .icon-fallback') || tile
    const ghost = source.cloneNode(true)
    ghost.className = `${source.className} drag-ghost`
    positionDragGhost(ghost, e)
    document.body.appendChild(ghost)
    return ghost
  }

  function positionDragGhost (ghost, e) {
    ghost.style.left = `${e.clientX}px`
    ghost.style.top = `${e.clientY}px`
  }

  function startDrag (e, tile) {
    e.preventDefault()
    dragState = { tile, pointerId: e.pointerId }
    tile.classList.add('dragging')
    dragGhost = createDragGhost(tile, e)
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    handle.addEventListener('pointermove', onDragMove)
    handle.addEventListener('pointerup', onDragEnd)
    handle.addEventListener('pointercancel', onDragEnd)
  }

  function onDragMove (e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return
    if (dragGhost) positionDragGhost(dragGhost, e)
    // elementFromPoint ignores pointer capture, so this sees whatever tile
    // is actually under the finger/cursor right now regardless of which
    // element captured the pointer. (The ghost is pointer-events: none, so
    // it's never what's returned here even though it's visually on top.)
    const target = document.elementFromPoint(e.clientX, e.clientY)
    const overTile = target && target.closest('.tile')
    if (!overTile || overTile === dragState.tile || !grid.contains(overTile)) return
    const rect = overTile.getBoundingClientRect()
    const before = (e.clientX - rect.left) < rect.width / 2
    grid.insertBefore(dragState.tile, before ? overTile : overTile.nextSibling)
  }

  function onDragEnd (e) {
    if (!dragState || e.pointerId !== dragState.pointerId) return
    const { tile } = dragState
    tile.classList.remove('dragging')
    if (dragGhost) {
      dragGhost.remove()
      dragGhost = null
    }
    const handle = e.currentTarget
    handle.removeEventListener('pointermove', onDragMove)
    handle.removeEventListener('pointerup', onDragEnd)
    handle.removeEventListener('pointercancel', onDragEnd)
    try { handle.releasePointerCapture(e.pointerId) } catch (err) { /* already released */ }
    dragState = null
    // #grid only ever holds visible tiles now (see render()), so rebuild
    // the full order by appending hidden apps back in whatever relative
    // order they already had — dragging the active tiles never touches
    // where hidden ones sit, it only matters again once they're unhidden.
    const hiddenSet = new Set(config.hidden)
    const visibleOrder = [...grid.children].map((el) => el.dataset.name)
    const hiddenOrder = orderedWebapps().filter((w) => hiddenSet.has(w.name)).map((w) => w.name)
    saveConfig({ order: [...visibleOrder, ...hiddenOrder] })
      .catch((err) => console.error('signalk-webapp-launcher: save failed', err))
  }

  /**
   * Builds one tile. `draggable` is only true for the active grid — the
   * Hidden section's tiles don't reorder (see onDragEnd), so they skip the
   * pointerdown listener entirely rather than looking grabbable and doing
   * nothing.
   */
  function buildTile (webapp, { editMode, isHidden, draggable }) {
    const label = config.renames[webapp.name] || webapp.label
    const tile = document.createElement(editMode ? 'div' : 'a')
    tile.className = 'tile'
    tile.dataset.name = webapp.name
    if (!editMode) tile.href = webapp.location
    if (isHidden) tile.classList.add('tile-hidden')

    tile.appendChild(makeIcon(webapp))

    const labelEl = document.createElement('div')
    labelEl.className = 'label'
    labelEl.textContent = label
    tile.appendChild(labelEl)

    if (webapp.description) {
      const descEl = document.createElement('div')
      descEl.className = 'description'
      descEl.textContent = webapp.description
      descEl.hidden = config.hideDescriptions
      tile.appendChild(descEl)
    }

    if (editMode) {
      if (draggable) {
        // Grab anywhere on the tile except the label (needs its own tap to
        // focus for renaming) and the Hide/Show button (needs its own tap
        // to fire its click).
        tile.addEventListener('pointerdown', (e) => {
          if (e.target === labelEl || e.target.closest('.hide-toggle')) return
          startDrag(e, tile)
        })
      }

      labelEl.contentEditable = 'true'
      labelEl.addEventListener('click', (e) => e.stopPropagation())
      labelEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          labelEl.blur()
        }
      })
      labelEl.addEventListener('blur', () => commitRename(webapp, labelEl))

      const hideButton = document.createElement('button')
      hideButton.type = 'button'
      hideButton.className = 'hide-toggle'
      hideButton.textContent = isHidden ? 'Show' : 'Hide'
      hideButton.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        toggleHidden(webapp)
      })
      tile.appendChild(hideButton)
    }

    return tile
  }

  function render () {
    const hiddenSet = new Set(config.hidden)
    const ordered = orderedWebapps()
    const visible = ordered.filter((w) => !hiddenSet.has(w.name))
    const hiddenApps = ordered.filter((w) => hiddenSet.has(w.name))

    grid.innerHTML = ''
    emptyState.hidden = visible.length > 0
    grid.classList.toggle('edit-mode', editMode)
    for (const webapp of visible) {
      grid.appendChild(buildTile(webapp, { editMode, isHidden: false, draggable: true }))
    }

    // Hidden apps get their own section below, so they never sit between
    // active tiles while reordering — dragging in #grid only ever sees
    // other visible tiles (see onDragMove/onDragEnd). Only shown in edit
    // mode, and only when there's actually something in it.
    hiddenSection.hidden = !editMode || hiddenApps.length === 0
    hiddenGrid.innerHTML = ''
    hiddenGrid.classList.toggle('edit-mode', editMode)
    for (const webapp of hiddenApps) {
      hiddenGrid.appendChild(buildTile(webapp, { editMode, isHidden: true, draggable: false }))
    }
  }

  editToggle.addEventListener('click', () => {
    editMode = !editMode
    editToggle.textContent = editMode ? 'Done' : 'Edit'
    editToggle.classList.toggle('active', editMode)
    showDescriptionsControl.hidden = !editMode
    iconSizeControl.hidden = !editMode
    dayBgControl.hidden = !editMode
    nightBgControl.hidden = !editMode
    themeSourceControl.hidden = !editMode
    render()
  })

  showDescriptions.addEventListener('change', () => {
    saveConfig({ hideDescriptions: !showDescriptions.checked })
      .then(() => render())
      .catch((err) => console.error('signalk-webapp-launcher: save failed', err))
  })

  iconSizeSlider.addEventListener('input', () => onIconSizeInput(iconSizeSlider.value))
  iconSizeNumber.addEventListener('input', () => onIconSizeInput(iconSizeNumber.value))

  dayBgColor.addEventListener('input', () => onBackgroundColorInput('day', dayBgColor.value))
  nightBgColor.addEventListener('input', () => onBackgroundColorInput('night', nightBgColor.value))

  themeSourceSelect.addEventListener('change', () => {
    const value = themeSourceSelect.value
    config.themeSource = value
    if (value === 'signalk') startSunPolling()
    else stopSunPolling()
    applyBackgroundColor()
    saveConfig({ themeSource: value }).catch((err) => console.error('signalk-webapp-launcher: save failed', err))
  })

  load().catch((err) => {
    console.error('signalk-webapp-launcher: failed to load', err)
    emptyState.hidden = false
    emptyState.textContent = 'Failed to load installed webapps.'
  })
})()
