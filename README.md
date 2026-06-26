# WebDash v0.23.0

A self-hosted, configurable dashboard for organizing services, links, and systems in one place.

WebDash is designed to be simple, flexible, and fully under your control. It runs locally with no external dependencies and works equally well on personal machines, home labs, NAS devices, and small VPS setups.

---

## Features

- Multiple dashboards with independent layouts
- Custom categories and buttons
- Drag-and-drop layout editor
- Import and export of full system backups
- Theme and background system
- Quick access (favorites & recents)
- Fully self-hosted (no cloud dependencies)
- Lightweight and framework-free

---

## Quick Start (Docker – Recommended)

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

| Variable   | Description                     | Default      |
|------------|--------------------------------|--------------|
| `PORT`     | HTTP server port               | `3000`       |
| `DATA_PATH`| Directory for persisted data   | `./data`     |

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

---

## Security Notes

- WebDash does **not include authentication** by default  
- Intended for **trusted or private networks**
- If exposed to the internet, use a **reverse proxy with authentication**

---

## Versioning

WebDash follows a semantic-style versioning format:

```
MAJOR.MINOR.PATCH
```

Example:

```
v0.19.0
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

New features, improvements, and refinements are continuously being developed.  
Bug reports and feature suggestions are welcome via GitHub Issues.

---

## I Disclosure

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
