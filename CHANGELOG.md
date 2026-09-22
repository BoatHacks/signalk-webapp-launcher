# Changelog

All notable changes to this project are documented here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Launch-screen webapp: reorderable, renameable icon grid for switching
  between installed Signal K webapps.
- Edit mode (toggled from the toolbar) exposing reorder (drag, via Pointer
  Events — works on touch, pen, and mouse), rename, and per-app hide/show,
  all without leaving the page.
- Icon size control (slider + numeric field), also adjusting how many
  tiles fit per row.
- Optional description text under each icon, toggleable.
- Day/night background colors, switched by the device's own light/dark
  setting by default, or optionally by the boat's own
  `environment.sun`/`environment.mode` data — see
  [`docs/auto-day-night-source.md`](docs/auto-day-night-source.md).
- Display names and icons scraped from each installed webapp's
  `package.json` (`signalk.displayName`/`signalk.appIcon`), independent of
  the plugin API's `app.webapps` (unreliable from inside a plugin — see
  `index.js`).
- Viewing works without a login on servers with `allow_readonly` set
  (`router.access('readonly')`); editing requires a `readwrite`/`admin`
  session and hands off to the admin UI's own login screen otherwise.
