(function () {
  const API = '/plugins/signalk-launcher'
  const PLUGIN_NAME = 'signalk-launcher'

  const grid = document.getElementById('grid')
  const emptyState = document.getElementById('empty-state')
  const editToggle = document.getElementById('edit-toggle')
  const showDescriptions = document.getElementById('show-descriptions')
  const header = document.querySelector('header')
  const loginRedirect = document.getElementById('login-redirect')

  let webapps = []
  let config = { order: [], renames: {}, hidden: [], hideDescriptions: true }
  let editMode = false
  let dragged = null

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
    saveConfig({ renames }).catch((err) => console.error('signalk-launcher: save failed', err))
  }

  function toggleHidden (webapp) {
    const hiddenSet = new Set(config.hidden)
    if (hiddenSet.has(webapp.name)) hiddenSet.delete(webapp.name)
    else hiddenSet.add(webapp.name)
    const hidden = [...hiddenSet]
    saveConfig({ hidden })
      .then(() => render())
      .catch((err) => console.error('signalk-launcher: save failed', err))
  }

  function handleDragStart (e, tile) {
    dragged = tile
    tile.classList.add('dragging')
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragOver (e, tile) {
    e.preventDefault()
    if (!dragged || dragged === tile) return
    const rect = tile.getBoundingClientRect()
    const before = (e.clientX - rect.left) < rect.width / 2
    tile.parentNode.insertBefore(dragged, before ? tile : tile.nextSibling)
  }

  function handleDrop () {
    if (!dragged) return
    dragged.classList.remove('dragging')
    const order = [...grid.children].map((el) => el.dataset.name)
    dragged = null
    saveConfig({ order }).catch((err) => console.error('signalk-launcher: save failed', err))
  }

  function render () {
    const hiddenSet = new Set(config.hidden)
    // Outside edit mode, hidden apps are simply left off the launch screen.
    // In edit mode they're shown dimmed with an unhide button, so hiding is
    // discoverable and reversible instead of apps just disappearing forever.
    const list = orderedWebapps().filter((w) => editMode || !hiddenSet.has(w.name))
    grid.innerHTML = ''
    emptyState.hidden = list.length > 0
    grid.classList.toggle('edit-mode', editMode)

    for (const webapp of list) {
      const isHidden = hiddenSet.has(webapp.name)
      const label = config.renames[webapp.name] || webapp.label
      const tile = document.createElement(editMode ? 'div' : 'a')
      tile.className = 'tile'
      tile.dataset.name = webapp.name
      if (!editMode) tile.href = webapp.location
      if (editMode && isHidden) tile.classList.add('tile-hidden')

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
        tile.draggable = true
        tile.addEventListener('dragstart', (e) => handleDragStart(e, tile))
        tile.addEventListener('dragover', (e) => handleDragOver(e, tile))
        tile.addEventListener('drop', handleDrop)

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

      grid.appendChild(tile)
    }
  }

  editToggle.addEventListener('click', () => {
    editMode = !editMode
    editToggle.textContent = editMode ? 'Done' : 'Edit'
    editToggle.classList.toggle('active', editMode)
    render()
  })

  showDescriptions.addEventListener('change', () => {
    saveConfig({ hideDescriptions: !showDescriptions.checked })
      .then(() => render())
      .catch((err) => console.error('signalk-launcher: save failed', err))
  })

  load().catch((err) => {
    console.error('signalk-launcher: failed to load', err)
    emptyState.hidden = false
    emptyState.textContent = 'Failed to load installed webapps.'
  })
})()
