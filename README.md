# Signal K Webapp Launcher

A start screen for switching between the webapps installed on a Signal K
server — an icon grid you can reorder, rename, and prune, instead of the
raw alphabetical list.

## Why

Signal K's own webapps list gives you every installed app's raw npm package
name and its full app-store description underneath the icon, in whatever
order they happened to install in. On a boat with fifty-odd plugins
installed, most of which nobody looks at from a touchscreen, that's a wall
of noise. This is a small, focused alternative: pick which apps show up,
give them names that make sense to you, size the icons for your screen,
and set the background to match day and night running.

## Features

- **Reorder** — drag tiles into the order you want. Works with touch
  (iPad/Android), Apple Pencil, and mouse alike (Pointer Events, not the
  HTML5 Drag and Drop API, which iOS Safari never implements for touch).
- **Rename** — override any tile's label; the original name comes back if
  you clear it.
- **Hide** — remove an app from the launch screen without uninstalling it.
  Hidden apps stay visible (dimmed, with a Show button) while in edit mode,
  so hiding is never a one-way trip.
- **Icon size** — a slider and a numeric field; the grid's column count
  adjusts to match, not just the icons themselves.
- **Descriptions** — each app-store description can be shown or hidden
  under its icon.
- **Day/night background** — two saved colors, switched either by the
  device's own light/dark setting or, optionally, by the boat's own
  `environment.sun`/`environment.mode` data (see
  [`docs/auto-day-night-source.md`](docs/auto-day-night-source.md)) — useful
  for kiosk displays with no working OS dark mode of their own.

All of the above lives in one shared layout (not per-browser settings), so
every display on the boat sees the same thing. Edit mode is reached via the
**Edit** button in the toolbar; all the controls above except reordering
and renaming are otherwise hidden to keep the normal launch screen clean.

## Install

From the Signal K server's **Admin UI → Appstore**, search for
**Webapp Launcher**, or from the command line:

```bash
cd ~/.signalk
npm install signalk-webapp-launcher
```

Restart the server, then enable it under **Server → Plugin Config →
Launcher**. Open `http://<your-server>:3000/signalk-webapp-launcher/`.

Viewing the launcher needs no login when the server has `allow_readonly`
set (Security config); editing (reordering, renaming, hiding, colors) does
require a logged-in `readwrite`/`admin` session, and hands off to the
admin UI's own sign-in screen if you're not already logged in.

## How it finds apps

The installed-webapp list itself comes from Signal K's own public
`GET /signalk/v1/apps/list`. Each app's nicer display name and icon are
scraped directly from its `package.json` (`signalk.displayName`,
`signalk.appIcon`) under `~/.signalk/node_modules` at plugin startup —
not from the plugin API's `app.webapps`, which is a snapshot taken before
the server has actually populated it and is therefore unreliable from
inside any plugin. An app with neither field just shows its raw package
name and a plain letter avatar; rename it in edit mode if you want
something nicer.

## Development

```bash
npm test
```

No runtime dependencies. `index.js` is the Signal K plugin (a handful of
routes registered via `router.access('readonly'|'readwrite')`, so viewing
works without a login when the server allows it while editing stays
gated); `lib/` holds the plugin's pure, independently-tested logic
(persisted layout, the webapp-metadata scan, the sun-phase lookup);
`public/` is the webapp itself — plain HTML/CSS/JS, no build step.

## License

MIT
