# Day/night background: SignalK sun data as an alternate source

## 1. Current behavior

`dayBackground`/`nightBackground` (config-store.js, added for the icon-size/
background-color feature) are two saved hex colors. Which one is applied is
decided client-side in app.js by `window.matchMedia('(prefers-color-scheme:
dark)')` — the *device's* OS light/dark setting.

Problem: many marine/kiosk displays (a fixed helm tablet, an old Android
panel) never expose an OS dark-mode setting at all, or have it fixed
regardless of actual time of day. The background never changes on those
displays no matter what colors are configured.

## 2. Proposed change

Add a second source for "is it currently day or night," reusing the pattern
already shipped and running in `signalk-checklist`'s `autoTheme` feature
(`lib/theme.js`, `index.js`'s `GET /theme`, `public/app.js`'s polling
effect): read `environment.sun` (set by `signalk-derived-data` to one of
`dawn`/`sunrise`/`day`/`sunset`/`dusk`/`night`) or, failing that,
`environment.mode` (a simpler `day`/`night` string some setups publish
instead).

This is additive, not a replacement — `dayBackground`/`nightBackground`
stay exactly as they are; only *which one is currently active* gains a
second possible source.

## 3. Data model

New config field, alongside the existing ones in `launcher-config.json`:

```
themeSource: 'system' | 'signalk'   // default 'system' — no behavior change for existing installs
```

`'system'` = current behavior (`prefers-color-scheme`). `'signalk'` = read
`environment.sun`/`environment.mode` as described above.

This is boat-wide shared config (same file as order/renames/hidden/
iconSize/colors), not per-browser localStorage. Reasoning: *which source to
trust* is a property of the boat's setup (does it have a sun-data plugin
installed, do the mounted displays have working OS dark mode), not of the
individual device — every display should make the same choice. This
mirrors how every other launcher setting already works (one shared layout,
edited in edit mode, seen by every device), and differs from
`signalk-checklist`'s theme, which is deliberately per-device (a person's
own light/dark preference, stored in that browser's localStorage) — the
two features are shaped differently on purpose because "day/night on a
shared kiosk background" and "one person's reading preference" are
different kinds of setting.

## 4. Server side

Add `lib/theme-source.js`, structurally identical to `signalk-checklist`'s
`lib/theme.js`:

```js
function computeDayOrNight (app) {
  // same environment.sun / environment.mode read + SUN_DARK_PHASES logic
  // as signalk-checklist/lib/theme.js, returning 'day' | 'night' | null
}
```

Duplicated rather than shared as a dependency between the two plugins — a
few dozen lines, no shared release/versioning burden for something this
small. If a third plugin needs it, that's the point to extract a shared
package, not before.

New route, `readonly` like the rest of the launcher's GETs:

```
GET /plugins/signalk-launcher/sun-phase → { phase: 'day' | 'night' | null }
```

`null` when neither `environment.sun` nor `environment.mode` has a
recognized value yet (no sun-data plugin installed, or it hasn't published
anything since restart) — see §5 for why this route doesn't look at
`themeSource` at all.

## 5. Client side

- New "Background follows" control in edit mode, next to the two color
  swatches: a `<select>` with two options, "This device's setting"
  (`system`) and "Boat's sun data" (`signalk`). Resolves §6's widget
  question — a select reads unambiguously at a glance and needs no extra
  layout beyond what the existing labeled toolbar controls already use.
- The `GET /sun-phase` route is unconditional — it always attempts
  `environment.sun`/`environment.mode` and returns whatever it finds,
  regardless of the saved `themeSource`. Deciding whether to use that
  value is entirely a client concern (see below). Keeps the route a pure
  function of live SignalK state, not entangled with saved config.
- Polling only runs while `themeSource === 'signalk'`, started when the
  select is switched to that value (or on load, if it's already saved as
  `signalk`) and stopped when switched back to `system` — resolves §6's
  poll-lifecycle question. Interval: 60s, matching `signalk-checklist`'s
  `autoTheme` (sun position changes slowly; no reason to poll faster).
- If `phase` comes back `null` (no sun data available): leave whatever
  color is currently applied alone, matching `signalk-checklist`'s
  "no recommendation this cycle → leave as-is" behavior. Never falls back
  to `prefers-color-scheme` automatically — if `signalk` is explicitly
  chosen as the source and it's currently unavailable, that's a
  configuration problem to surface, not something to silently paper over
  by switching sources underneath the user.
- Resolves §6's status-note question: whenever `themeSource === 'signalk'`
  and the most recent poll returned `phase: null`, show a small muted
  inline note ("No sun data received yet") next to the select. Hidden the
  rest of the time (including whenever `system` is selected).

## 6. Resolved

- **Status note**: yes — see §5. Text only, no retry button; the poll
  itself already retries every 60s.
- **Control widget**: a `<select>`, not radio buttons — see §5.
- **Poll lifecycle**: starts/stops with the select's value, not a
  standalone toggle — see §5.

- **How should "sun data unavailable" surface in edit mode?** Silently
  doing nothing (per §5) is correct for the *displayed background*, but a
  user who picks "boat's sun data" on a boat with no `signalk-derived-data`
  (or equivalent) installed would see no feedback at all that their choice
  is inert. Worth a small inline status note ("no sun data received yet")
  next to the control — not designed here.
- **Exact control widget** for the source picker — radio pair, a `<select>`,
  or a single toggle switch. Whatever's used should sit visually next to
  the day/night color swatches it governs, not elsewhere in the toolbar.
- **Should the poll only run while `themeSource === 'signalk'`**, starting/
  stopping as the user flips the control (yes, obviously — noted here so
  the implementation doesn't leave an orphaned `setInterval` running after
  switching back to `'system'`).
