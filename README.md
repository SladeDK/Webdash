# WebDash v1.0.0

A self-hosted, configurable dashboard for organizing services, links, and systems in one place.  

WebDash is designed to be simple, flexible, and fully under your control while still providing a polished, modern user experience. It runs locally with no external dependencies and works equally well on personal machines, homelabs, NAS devices, and VPS setups.

The system is built around a modular preferences and layout architecture, allowing users to customize behavior, appearance, and structure without complexity.

---

## Features

- Multiple dashboards with independent layouts and appearance
- Custom categories and service buttons
- Drag-and-drop layout editor for categories and buttons
- Global and per-dashboard appearance system (themes & backgrounds)
- Quick Access system with favorites and recents
- Advanced behavior settings and user preferences
- Data-driven toggle system for configurable features
- Import and export of full system backups
- Identity system (custom name and icon per dashboard)
- Fully self-hosted (no cloud dependencies)
- Lightweight and framework-free

---

### Customization

WebDash includes a flexible customization system:

- Theme system with multiple built-in themes
- Background system with multiple visual styles
- Per-dashboard or synchronized appearance
- Adjustable behavior settings via toggle system
- Quick Access configuration (favorites and recents)
- Identity customization (dashboard name and icon)

All preferences are stored locally and applied instantly.

---

### Preferences System

WebDash uses a data-driven preferences system that controls user behavior and application features.

- Centralized preference state
- Configurable feature toggles
- Instant UI updates on change
- Persistent across sessions

This system allows new features to be added without tightly coupling logic to the UI, keeping the codebase scalable and maintainable.

---
## Quick Start (Docker - Recommended)

### Prerequisites
- Docker
- Docker Compose

### Run

```bash
git clone https://github.com/sladedk/webdash.git
cd webdash
cp .env.example .env
docker compose up --build -d
```

Open in your browser:

```
http://localhost:3000
```
To change the port simply edit the .env file.

All data is stored locally and persists across restarts.

---

## Local Development (No Docker)

### Prerequisites
- Node.js 18 or newer
- npm

### Run

```bash
npm install
node server/server.js
```

Then visit:

```
http://localhost:3000
```

---

## Configuration

WebDash is configured using environment variables.

Create a `.env` file:

```bash
cp .env.example .env
```

### Available Variables

| Variable              | Description                                        | Default  |
|-----------------------|----------------------------------------------------|----------|
| `PORT`                | HTTP server port                                   | `3000`   |
| `DATA_PATH`           | Directory for persisted data                       | `./data` |
| `BACKUP_KEEP`         | Rolling backups kept per user (0 = off)            | `10`     |
| `BACKUP_MIN_INTERVAL` | Min. seconds between backup snapshots per user     | `10`     |

---

## Deployment Options

WebDash is platform-agnostic and can be deployed on:

- Local machines
- Home servers / NAS devices
- Raspberry Pi
- VPS (self-hosted)
- Docker with reverse proxy (Nginx, Traefik, Caddy)

Once running, WebDash does not require internet access.

---

## Tech Stack

- Vanilla JavaScript
- HTML & CSS
- Node.js
- Docker (optional)

No frameworks. No databases. No cloud services.  
Designed for simplicity while maintaining a structured and scalable architecture.

---

## Security Notes

- WebDash does **not include authentication** by default  
- Intended for **trusted or private networks**
- If exposed to the internet, use a **reverse proxy with authentication**
- User names are sanitized server-side and all user-provided text is escaped before rendering
- Data files are written atomically, so a crash mid-save cannot corrupt existing data

---

## What's New in 1.0.0

WebDash 1.0.0 is the first stable release, focused on performance and making
the app truly self-contained.

**Performance**
- **Instant theme & background switching** — visuals apply immediately; persistence happens in the background. Synchronizing appearance across dashboards is now a single request (one write, one backup) instead of three round-trips per dashboard.
- **Faster startup** — the app boots with 2 API requests instead of ~10; the full system state loads in one call.
- **Server-side caching** — user data is cached in memory (no disk read per request), and static assets are served with long-lived cache headers.
- **Lighter edits** — adding/renaming/reordering buttons and categories no longer re-fetches every dashboard or renders the page twice; exports and import previews load all dashboards in one request.
- **Smaller assets** — the logo went from 301 KB to 14 KB; the accent color picker no longer saves on every drag tick.
- **Favicons are cached** — icon lookups are resolved once per site and remembered (including "this site has no icon"), instead of re-probing up to 4 URLs per button on *every* re-render. On a 30-button dashboard this removed ~30 network requests per interaction. Turning **Show icons off now does no icon fetching at all.**
- **Far fewer compositor layers** — every button carried `will-change: transform`, and every favicon a `drop-shadow` filter, permanently promoting dozens of elements to their own GPU layers. Both are gone, which is most noticeable on icon-heavy dashboards and low-powered hosts (Raspberry Pi, NAS).
- **No pointless re-renders** — clicking a button rebuilt the entire dashboard even when nothing changed (e.g. with recents tracking switched off). It now re-renders only when the recents list actually changes.

**Fully self-hosted, works offline**
- Font Awesome and the UI fonts (Inter, JetBrains Mono) now ship with WebDash. The previous external font/icon CDNs are gone — after `docker compose up`, WebDash makes **zero external requests** (except optional button favicons).
- The render-blocking icon script was replaced with plain, cacheable CSS.

**Data safety**
- Backup snapshots are throttled (`BACKUP_MIN_INTERVAL`, default 10 s) so a burst of rapid changes counts as one change instead of rotating away your entire backup history. Restores still always snapshot first.

**Fixes**
- Docker Compose port mapping now works when `PORT` is not 3000, and the container healthcheck is back.
- The OS dark/light mode listener was registered twice; dashboard identity icons no longer force a re-download on every dashboard switch.
- Opening WebDash in a **background tab** could leave it blank until focused — the page revealed itself on an animation frame, which browsers pause in hidden tabs.
- An invalid saved theme or background is now actually detected: the reset notice appears and the corrected value is persisted (previously the check silently never matched).
- Theme and background selection now highlight the correct entry when appearance sync is **off** — they were reading the global setting instead of the dashboard's own.
- First paint uses the resolved theme, so "System" theme users no longer see a flash of the wrong colours on load.
- A malformed CSS comment in the Classic UI stylesheet was silently voiding a dropdown styling rule.

---

## What's New in 0.27.0

**Data safety**
- **Rolling backups**: the server snapshots your data before every change (last 10 kept, configurable via `BACKUP_KEEP`). Restore any snapshot from Data Management — and because restoring itself takes a backup first, it's always reversible.
- **Undo** on button and category deletion, straight from the toast.

**Productivity**
- **Duplicate** any button, category, or dashboard with one click.
- **Collapsible categories** (toggle) — fold sections on large dashboards; state is remembered per dashboard.
- **Drag buttons between categories**, not just within them.
- **Per-dashboard export/import** — share or move a single dashboard; imports are auto-detected and added as new.
- **Smarter search** — fuzzy matching (`plx` → Plex), matches URLs, and Enter opens the top hit.

**Personalization**
- **Clock & greeting** widget (toggle).
- **Compact mode** (toggle) for a denser layout.
- **Custom accent color** — recolor the whole UI, with reset.
- **Custom background image** — upload your own wallpaper.
- **Button descriptions** (toggle) — optional subtitles on buttons.

---

## What's New in 0.26.0

**Security & reliability**
- Fixed a path traversal issue in the user rename/delete API
- All user-provided text (names, labels, import files) is now HTML-escaped before rendering
- Atomic data file writes; failed saves now return an error instead of silently succeeding
- Malformed JSON and oversized payloads return proper error responses
- Added `/api/health` endpoint plus Docker healthchecks
- Graceful shutdown on SIGINT/SIGTERM (clean Docker stops)

**Fixes**
- Button URLs now accept IP addresses, `localhost`, ports, and intranet hostnames (e.g. `192.168.1.10:8080`, `nas:5000`)
- "Automatically close dropdowns" preference is now applied after a reload
- Command palette no longer shows stale buttons after editing dashboards
- Command palette toggle entries show their correct group name

**Improvements**
- Press `/` to focus the service search; Escape clears it
- Search now also matches button URLs and shows a "no results" state
- Buttons show their URL as a tooltip
- Command palette: added "Export User Backup" command

---

## Versioning

WebDash follows a semantic-style versioning format:

```
MAJOR.MINOR.PATCH
```

Example:

```
v1.0.0
```

### Version Components

- **MAJOR**  
  Breaking changes or significant redesigns

- **MINOR**  
  New features and improvements (backwards-compatible)

- **PATCH**  
  Bug fixes and minor enhancements

---

## Project Status

WebDash is stable and actively evolving.  
The focus of development is on improving usability, performance, and extensibility while keeping the system lightweight and dependency-free.

Bug reports and feature suggestions are welcome via GitHub Issues.

---

## AI Disclosure

AI was used in the development of parts of this project.

---

## License

WebDash is licensed under the  
**Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)**

You are free to:

- Use
- Modify
- Share

…for **non-commercial purposes**, as long as proper credit is given.

Commercial use requires explicit permission.

---

## Contributing

Contributions are welcome!

Please:

- Keep pull requests focused
- Avoid heavy dependencies
- Follow the existing code style and structure
