# Anamnesies

[![CI](https://github.com/RobinsSuperSchmiede/PLM/actions/workflows/ci.yml/badge.svg)](https://github.com/RobinsSuperSchmiede/PLM/actions/workflows/ci.yml)
[![CodeQL](https://github.com/RobinsSuperSchmiede/PLM/actions/workflows/codeql.yml/badge.svg)](https://github.com/RobinsSuperSchmiede/PLM/actions/workflows/codeql.yml)
[![Secret scan](https://github.com/RobinsSuperSchmiede/PLM/actions/workflows/secret-scan.yml/badge.svg)](https://github.com/RobinsSuperSchmiede/PLM/actions/workflows/secret-scan.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Anamnesies is a local-first personal workspace for projects, tasks, calendar, meetings, notes, documents, files and ideas. It runs on your own machine, connects to AI assistants such as Claude through MCP, and comes with its own Telegram bot for reminders and quick capture on the go.

- **Local-first:** your data stays in your own PostgreSQL (or SQLite) database.
- **AI-ready:** a built-in MCP server lets Claude and other assistants read and write your workspace.
- **Desktop app, web app or Docker:** the same app runs as a desktop window, in the browser or in containers.

## Contents

- [Features](#features)
- [Getting started](#getting-started)
- [Desktop app (OpenShell)](#desktop-app-openshell)
- [Local development](#local-development)
- [Docker](#docker)
- [Configuration](#configuration)
- [Accounts and sign-in](#accounts-and-sign-in)
- [MCP and AI assistants](#mcp-and-ai-assistants)
- [Telegram bot](#telegram-bot)
- [Custom domain and email](#custom-domain-and-email)
- [Repository structure](#repository-structure)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

## Features

**Plan**
- **Today** – what is due today and in the coming days; **Pinned** – your most important projects and lists.
- **Projects** with their own overview page, **tasks**, **calendar** with events and **reminders** (also recurring), **meetings** with notes.

**Capture and knowledge**
- **Explorer** – notes, documents, files and images in a folder tree, with a Markdown editor (TipTap), tabs, `[[wiki links]]` and a split view (drag a note onto the editor to open it side by side).
- **Browser extension** (`extension/`) – sticky notes on any web page and websites attached to projects with URL and screenshot (Settings → Browser has the token).
- **Lists** and **ideas**; **tags** and links between any entries; a **graph** of how everything is connected.
- **Archive** for finished entries; **Warehouse** with the full history: every change, earlier versions and deleted entries, which can be restored.

**System**
- **MCP & AI** page with ready-made connection snippets, a **Telegram** page with the chat history, built-in **Docs**, a **Developer** page (status of API, database and MCP, endpoints) and a **Database** browser for the tables and records.
- Accounts with separate workspaces, Telegram two-factor sign-in and per-browser sessions.

**Interface**
- Built on a minimal design system: light, dark or system theme, accent colors, density, corner radius, wallpaper and optional background animations (ASCII scenes, a pixel sun).
- UI in German, English, Spanish, Portuguese (Brazil), Chinese (Simplified) and Japanese (Settings → General). German and English ship with the app, the other language packs load when chosen.
- A full-screen first-run walkthrough sets up language, design, MCP and Telegram; Settings → General starts it again.
- Works on phones as well; the workspace is cached in the browser and only changes are synced.

## Getting started

| Way | For | Needs |
|---|---|---|
| [Download](https://robinssuperschmiede.github.io/PLM/) | Everyday use on your own computer | Nothing: the installer sets up Python, Node.js and PostgreSQL itself if they are missing |
| [Desktop app from a checkout](#desktop-app-openshell) | Using the app while changing its code | OpenShell, Python 3.11+, Node.js 20+ (or let the app download them) |
| [Local development](#local-development) | Working on the code | Python 3.11+, Node.js 20+, optionally PostgreSQL |
| [Docker](#docker) | A server or a home lab | Docker / Docker Compose |

Want to try every view with realistic data? See [Demo data](#demo-data).

## Desktop app (OpenShell)

The desktop app is [OpenShell](https://github.com/RobinsSuperSchmiede/EDA) (Rust + Tauri 2, the system's own web view – no Electron). OpenShell is a generic shell: nothing of Anamnesies is compiled into it. `openshell.json` in this folder tells it what to run, and it runs it from this folder:

- **db** – PostgreSQL 18 (`apps/api/scripts/openshell_postgres.py`), on a free port, reachable only from this computer. It uses a PostgreSQL 18 of the system (`PG_BIN`, `PATH` or the usual install folders); without one it downloads the PostgreSQL build of the [zonky project](https://github.com/zonkyio/embedded-postgres-binaries) from Maven Central (about 25 MB, checked against a pinned SHA-256). The first start creates its own cluster in OpenShell's data folder with the user `plm`, the database `plm` and a random password (`postgres/password` there). On Windows OpenShell ends services without a grace period; PostgreSQL recovers from its log on the next start.
- **backend** – the FastAPI app (`apps/api/scripts/openshell_api.py`: creates `apps/api/.venv`, installs the packages, reinstalls them when `pyproject.toml` changes, starts uvicorn on a free port). It connects to the db service; uploads and further workspaces (PostgreSQL schemas `ws_<id>`) go to the data folder as well.
- **frontend** – the Next.js web app on **port 3000** (`apps/web/scripts/openshell-web.mjs`), connected to the backend through `API_INTERNAL_URL`. It is shown in the window and is also at `http://localhost:3000` in any browser.

The data folder is `.openshell/data` for `openshell dev` in a checkout and a per-user folder for the desktop app (Windows `%LOCALAPPDATA%\com.anamnesies.app\data`). **Existing data is taken over:** on the first start with an empty data folder, the backend imports the SQLite installation that `apps/api/.env` points to (`DATABASE_URL=sqlite:///…`, plus `UPLOAD_DIR` and `WORKSPACES_DIR`) into PostgreSQL – all workspaces and accounts in one transaction, uploads copied (`apps/api/scripts/import_sqlite.py`). The SQLite files stay untouched as a backup; the desktop app does not use them afterwards. A `DATABASE_URL` in the environment overrides all of this.

The web app is built into `apps/web/.next-desktop`, so it never collides with a `next dev` or `next build` you run in `apps/web` yourself (`.next`).

```bash
# once: OpenShell (CLI `openshell` and shell `openshell-desktop`, side by side on the PATH),
# from https://github.com/RobinsSuperSchmiede/EDA/releases or `cargo build --release` in a clone
openshell doctor            # checks the config, Python 3.11+, Node.js 20+, ports
openshell dev               # development: window, hot reload, backend restarts on changes
openshell start --detach    # production: builds the web app if its source changed, runs in the background
openshell dev --headless    # no window – open http://localhost:3000
openshell status · openshell logs db -f · openshell restart frontend · openshell stop
```

### Windows: Start menu and search

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-desktop.ps1 -Start
```

`scripts/install-desktop.ps1` puts OpenShell into `%LOCALAPPDATA%\OpenShell\bin` (downloaded with the GitHub CLI `gh`, as the OpenShell repository is private, or `-OpenShellDir <folder>`), creates `%LOCALAPPDATA%\Programs\Anamnesies` with `Anamnesies.exe` and `app` (a link to this repository) and a Start menu entry **Anamnesies** that Windows search finds. OpenShell runs it like an installed app – production mode, one instance, tray, per-user data – but from this repository, so code changes apply after restarting the service or the app. `-Uninstall` removes the entry and the program folder, never data or code. Port 3000 must be free; quit an `openshell dev` of the same checkout before starting the app. Python does not have to be on the PATH: `apps/api/plm-python.cmd` (Windows) and `apps/api/plm-python` (macOS/Linux) find Python 3.11+ via the PATH, the `py` launcher or the usual install folders; `PLM_PYTHON` points to a specific `python.exe`.

### Window and tray

The window has no system title bar (`window.title_bar: "overlay"`, OpenShell after 0.1.0): the app's header is the title bar. Its free space moves the window (double click maximizes), a right click opens OpenShell's runtime menu, and on Windows and Linux the header shows minimize, maximize and close (`apps/web/components/desktop-window.tsx`); macOS keeps its own window buttons. In a browser the header stays as it is.

Closing the window keeps the servers running in the tray (`close_to_tray`); the tray menu and, on Windows, a right-click on the title bar show every service with state, CPU and memory, and can restart them or open logs.

### Changing the app

The servers run from this folder, so changes take effect – by hand or with a coding agent. In development mode the backend restarts and the web app reloads on its own. In production mode restart the service (tray, or `openshell restart backend` / `openshell restart frontend`): the frontend rebuilds when its source changed, the backend reinstalls its packages when `pyproject.toml` changed. A rebuild takes about a minute, during which the web app does not answer. Coding agents can operate the running app over MCP: `claude mcp add anamnesies-dev -- openshell mcp --project .` (see the OpenShell docs; the app's own MCP server at `/mcp` stays as it is).

### Installers

**Download:** https://robinssuperschmiede.github.io/PLM/ (the page in `site/`) picks the installer for your system; the files are the assets of the [latest release](https://github.com/RobinsSuperSchmiede/PLM/releases/latest) under fixed names (`Anamnesies-Windows-x64-Setup.exe`, `Anamnesies-macOS-AppleSilicon.dmg`, `Anamnesies-Linux-x64.AppImage`, `Anamnesies-Linux-x64.deb`), so `releases/latest/download/<name>` always gives the newest one.

`openshell package` builds the web app and creates an installer with the app files (`setup.exe` on Windows, `.dmg` on macOS, `.deb`/`.AppImage` on Linux). `package.exclude` in `openshell.json` keeps `.env` files, databases, build caches and Docker files out of it. The installed app needs nothing else on the machine: the services start through `apps/api/plm-python` and `apps/web/plm-node`, which use a Python 3.11+ / Node.js 20+ of the system and otherwise download a pinned portable build once into the data folder (`runtimes/`, checked against a SHA-256 in `scripts/runtimes/ensure.ps1` / `ensure.sh`) – like the PostgreSQL of the db service. The first start then installs the packages (several minutes, needs the internet). `PLM_DOWNLOAD_RUNTIMES=1` makes the launchers skip the system's Python and Node.js, to try the download. Its files are replaced by updates, so develop in a checkout, not in the installed folder. The installers are not code-signed: Windows SmartScreen and macOS Gatekeeper warn on the first start, and Windows with Smart App Control on blocks them.

The GitHub workflow **Desktop app** (`.github/workflows/desktop.yml`) builds the installers for Windows, macOS (Apple Silicon) and Linux. Run it by hand under Actions to get them as run artifacts, or release a version:

```bash
git tag v0.2.0 && git push origin v0.2.0   # the tag sets the app version; the release is published when all three builds pass
```

The workflow downloads OpenShell from the releases of the OpenShell repository; while that repository is private, the secret `OPENSHELL_TOKEN` needs a token that can read it. The workflow **Download page** (`.github/workflows/pages.yml`) publishes `site/` with GitHub Pages (Settings → Pages → Source: GitHub Actions).

Next.js rewrites `apps/web/next-env.d.ts` to point at the build folder it used last (`.next` or `.next-desktop`); that change can be ignored.

## Local development

Requirements: **Node.js 20+** and **Python 3.11+**. PostgreSQL is optional – for quick work SQLite is enough.

```bash
# Frontend (http://localhost:3000)
npm install --prefix apps/web
npm --prefix apps/web run dev

# API (http://localhost:8000)
cd apps/api
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e .
DATABASE_URL=sqlite:///./plm.sqlite3 uvicorn app.main:app --reload --port 8000
```

Without `DATABASE_URL` the API connects to PostgreSQL with the `POSTGRES_*` values (see [Configuration](#configuration)). Tables are created on API startup. The web app reaches the API through `API_INTERNAL_URL` (default `http://localhost:8000`); the browser only talks to the web app, which proxies `/api/v1/*` and `/mcp`.

The `Makefile` has shortcuts (`make install-web`, `install-api`, `dev-web`, `dev-api`, `test-api`) for macOS and Linux. The API tests run with `pytest` in `apps/api`.

### Demo data

To try every view with realistic volume (hundreds of notes and tasks, projects, folders, tags, links, events, meetings, archive entries, Telegram history, activity and API statistics), run from `apps/api`:

```bash
python -m scripts.seed_demo
```

It adds to the database in `DATABASE_URL` (or with `--user <name>` to that account's workspace) and keeps existing entries; `--scale 0.5` or `--scale 2` changes the amount. Demo data never sends Telegram messages: its reminders are already done and its upcoming events are marked as announced.

## Docker

```bash
cp .env.example .env    # then change at least the passwords
docker compose up --build
```

This starts PostgreSQL 16, the API (port 8000) and the web app (port 3000). The database lives in the Docker volume `postgres_data`.

## Configuration

The API reads `apps/api/.env` (local) or the root `.env` (Docker); see `.env.example`. The most important values:

| Variable | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | – | Full SQLAlchemy URL, e.g. `sqlite:///./plm.sqlite3`. Overrides the `POSTGRES_*` values. |
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | `localhost`, `5432`, `plm`, `plm`, `plm` | PostgreSQL connection. |
| `AUTH_MODE` | `multi` | `multi`: accounts with username and password; `single`: no sign-in (see below). |
| `SESSION_DAYS` | `30` | Days a sign-in stays valid without use. |
| `UPLOAD_DIR` | `data/uploads` | Uploaded files of the first workspace. |
| `WORKSPACES_DIR` | `data/workspaces` | Further workspaces (SQLite) and their uploads. |
| `SCHEDULER_ENABLED` | `true` | Background loop for reminders, the daily summary and the Telegram bot. |
| `API_INTERNAL_URL` | `http://localhost:8000` | Where the web app reaches the API (server side). |
| `MCP_ALLOWED_HOSTS` | – | Extra hostnames allowed to reach the API/MCP directly, as a JSON list. |

Domain, MCP token, Telegram and email are set in the app under Settings, not in `.env`.

## Accounts and sign-in

- `AUTH_MODE=multi` (default): sign-in with username and password. On the first start the web app asks you to create the admin account; it takes over the existing data (the database from `DATABASE_URL`).
- Admins create further accounts under Settings → Users. Every account has a **separate workspace**: its own SQLite file (or PostgreSQL schema `ws_<id>`) and upload folder in `WORKSPACES_DIR`, its own settings, Telegram bot and MCP token. The MCP token also selects the workspace.
- Sign-in returns an access token kept in an httpOnly cookie; only its SHA-256 is stored. Sessions expire after `SESSION_DAYS` without use and can be signed out individually under Settings → Account. Passwords are hashed with scrypt; failed sign-ins are throttled. Telegram two-factor sign-in works per account.
- `AUTH_MODE=single`: no accounts and no sign-in, one local workspace – only for machines nobody else can reach.
- Lost the admin password? From `apps/api`: `python -m scripts.users password <username>` (also `list`, `create <name> [--admin]`, `enable`, `disable`).

## MCP and AI assistants

The API includes an MCP server (Streamable HTTP) at `/mcp`. Its tools cover the whole workspace: create, read, update, delete and search entries, links and tags, folders and the file tree, project overviews, history and restoring deleted entries, files, reminders, Telegram messages and email (`send_email`).

- Connection snippets for Claude Code, Claude Desktop and other clients are on the **MCP & AI** page (and in the first-run walkthrough).
- Every request needs the bearer token from Settings → MCP (unless disabled there); the token also selects the workspace.
- MCP requests are only accepted for `localhost` and the configured domains. For claude.ai in the browser or on a phone the server needs a public address – see [Custom domain](#custom-domain-and-email).

## Telegram bot

1. In Telegram, open [@BotFather](https://t.me/BotFather), send `/newbot` and copy the bot token.
2. Paste the token in Settings → Telegram and click the "Open in Telegram" link, then press **Start**. Only the chat that opens this one-time link is connected.
3. The bot then sends you reminders (Reminders page), a daily summary and alerts before events/meetings. Times use the timezone set there.
4. You can also message the bot: `/heute`, `/aufgaben`, `/aufgabe <title>`, `/erinnerung 18:00 <text>`, `/erinnerung in 30m <text>`, `/erinnerung morgen 9:00 <text>`, `/erinnerungen`, `/notiz <text>` (English: `/today`, `/tasks`, `/task`, `/remind`, `/reminders`, `/note`).

The bot uses long polling, so no public domain or webhook is needed – but the API has to be running for reminders to arrive. MCP clients can use `create_reminder`, `list_reminders` and `send_telegram_message`.

## Custom domain and email

1. Point your domain (e.g. `plm.example.com`) to this machine, e.g. with a reverse proxy (Caddy, nginx) or a tunnel (Cloudflare Tunnel) to port **3000**.
2. Enter the domain in Settings → Domain. The web UI is then reachable at `https://plm.example.com` and MCP at `https://plm.example.com/mcp`. An optional separate MCP domain is supported.
3. The REST API on port 8000 only answers local requests; everything from outside goes through the web app.
4. For email, configure SMTP and a sender address on your domain in Settings → Email and send a test mail.

## Repository structure

```
apps/
  web/                  Next.js 15 web app (React 19, Tailwind, shadcn/ui, TipTap)
  api/                  FastAPI app: REST API (/api/v1), MCP server (app/mcp_server),
                        scheduler, Telegram, email; scripts/ for demo data, users,
                        SQLite import and the OpenShell services; tests/ (pytest)
extension/              browser extension (Chrome/Edge): sticky notes on web pages and
                        websites with screenshots attached to projects, stored in the
                        workspace database (see extension/README.md)
packages/shared-contracts/  shared schemas between services
services/               placeholders for a future agent runtime and standalone MCP server
                        (MCP currently lives in apps/api)
docs/                   architecture, database, development and security notes
scripts/                install-desktop.ps1 (Windows Start menu entry)
openshell.json          desktop app definition (OpenShell)
docker-compose.yml      PostgreSQL + API + web app
.github/                CI, security checks, desktop installer builds, Dependabot,
                        issue and pull request templates
```

## Contributing

Contributions are welcome – bug reports, ideas, translations and code. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and the checks a pull request has to pass, and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Every push and pull request runs:

| Check | What it does |
|---|---|
| **CI** | Type check and production build of the web app, API tests on Python 3.11, 3.12 and 3.13 |
| **CodeQL** | Static security analysis of Python, TypeScript and the workflows (weekly as well) |
| **Secret scan** | gitleaks blocks commits that contain passwords, tokens or keys |
| **Dependency review** | Blocks pull requests that add dependencies with known high or critical vulnerabilities |
| **Dependabot** | Weekly update pull requests for npm, pip, GitHub Actions and the Docker images |

## Security

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md) – not in public issues. It also has hardening notes for self-hosting.

## License

Anamnesies is released under the [MIT License](LICENSE).
