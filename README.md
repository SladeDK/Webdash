# WebDash - v0.6.8
A self-hosted, configurable dashboard for organizing services, links, and systems in one place.

WebDash is designed to be easy to deploy, easy to customize, and fully self-hosted. It works well on local machines, home servers, NAS devices, and small VPS setups.

## Features

- Multiple dashboards
- Custom categories and buttons
- Drag-and-drop layout editor
- Import and export of full system backups
- Theme and background system
- No external services or cloud dependencies
- Designed for private and local deployments

---


## Quick Start (Docker – Recommended)
### Prerequisites:

- Docker
- Docker Compose

### Run:

```bash
git clone https://github.com/sladedk/webdash.git
cd webdash
cp .env.example .env
docker compose up --build -d
```
Then open your browser at:
```http://localhost:3000```
All data is stored locally and persists across restarts.

## Local Development (No Docker)
### Prerequisites:

- Node.js 18 or newer
- npm

Run:

```bash
npm install
node server/server.js
```

Then visit:
```http://localhost:3000```

## Configuration
WebDash is configured using environment variables.
Create a .env file based on the example:
```bash
cp .env.example .env
```
### Available variables:
- PORT:
  - HTTP server port
  - Default: 3000
- DATA_PATH:
  - Directory used for persisted data
  - Default: ./data

## Deployment Options
WebDash is platform-agnostic and can be deployed on:

- Local machines
- Home servers or NAS devices
- Raspberry Pi
- VPS (self-hosted)
- Docker with a reverse proxy (Nginx, Traefik, Caddy)

Once running, WebDash does not require internet access.

## Tech Stack

- Vanilla JavaScript
- HTML and CSS
- Node.js
- Docker (optional)

No frameworks.
No databases.
No cloud services.

## Security Notes

WebDash does not include authentication by default<br>
Intended for trusted or private networks<br>
If exposed publicly, a reverse proxy with authentication is strongly recommended

## Versioning

WebDash follows a semantic versioning–inspired format:

MAJOR.MINOR.PATCH

Example: v0.6.8

### Version Components

- MAJOR  
  Increased when there are breaking changes or major redesigns that may require manual adjustments or migration.

- MINOR  
  Increased when new features or significant improvements are added in a backwards-compatible way.

- PATCH  
  Increased for bug fixes, small improvements, or minor adjustments that do not change functionality.


## Project Status
WebDash is stable and usable, with ongoing improvements planned.
Bug reports and feature ideas are welcome via GitHub Issues.

## AI Disclosure

AI was used in the creation of parts of this project.

## License

WebDash is licensed under the Creative Commons Attribution-NonCommercial 4.0
International License (CC BY-NC 4.0).

You are free to use, modify, and redistribute this project for non-commercial
purposes, provided that you give appropriate credit and clearly reference the
original project.

Commercial use is not permitted without explicit permission.

## Contributing
Contributions are welcome.
Please keep pull requests focused and avoid introducing heavy dependencies.

