# Anamnesies

Anamnesies is a local-first AI platform designed to organize projects, tasks, calendar events, notes, ideas, and knowledge in a single personal workspace.

## Monorepo structure

- apps/web: Next.js dashboard frontend
- apps/api: FastAPI REST API
- services/agent-runtime: runtime foundation for future local AI automation
- services/mcp-server: foundation for future local MCP integration
- packages/shared-contracts: shared schemas between services
- docs: architecture and operational guidance
- infrastructure/docker: runtime and deployment helpers

## Getting started

### Requirements

- Node.js 20+
- Python 3.12+
- Docker Desktop / Docker Compose

### Install frontend dependencies

```bash
npm install --prefix apps/web
```

### Start the frontend

```bash
npm --prefix apps/web run dev
```

### Start the API

```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Docker-based setup

```bash
docker compose up --build
```

### Demo data

To try every view with realistic volume (hundreds of notes and tasks, projects, folders, tags, links,
events, meetings, archive entries, Telegram history, activity and API statistics), run from `apps/api`:

```bash
python -m scripts.seed_demo
```

It adds to the database in `DATABASE_URL` and keeps existing entries; `--scale 0.5` or `--scale 2` changes the amount.
Demo data never sends Telegram messages: its reminders are already done and its upcoming events are marked as announced.

## Features

- Next.js dashboard built with shadcn/ui, light/dark/system theme and German/English UI (Settings → General).
- Every area (projects, tasks, calendar, meetings, notes, lists, ideas, knowledge, records) is stored in the database via the FastAPI REST API. Tables are created on API startup.
- The browser talks only to the web app: `/api/v1/*` is proxied to the API after the access code (`APP_ACCESS_CODE`) was entered.
- MCP server (Streamable HTTP) at `/mcp` with tools for all workspace areas plus `send_email`. Connection snippets for Claude Code / Claude Desktop are on the "MCP & AI" page.

## Custom domain (local install)

1. Point your domain (e.g. `plm.example.com`) to this machine, e.g. with a reverse proxy (Caddy, nginx) or a tunnel (Cloudflare Tunnel) to port **3000**.
2. Enter the domain in Settings → Domain. The web UI is then reachable at `https://plm.example.com` and MCP at `https://plm.example.com/mcp`. An optional separate MCP domain is supported.
3. MCP requests are only accepted for `localhost` and the configured domains and require the bearer token from Settings → MCP (unless disabled). The REST API on port 8000 only answers local requests.
4. For email, configure SMTP and a sender address on your domain in Settings → Email and send a test mail.

## Telegram reminders & notifications

1. In Telegram, open [@BotFather](https://t.me/BotFather), send `/newbot` and copy the bot token.
2. Paste the token in Settings → Telegram and click the "Open in Telegram" link, then press **Start**. Only the chat that opens this one-time link is connected.
3. The bot then sends you reminders (Reminders page), a daily summary and alerts before events/meetings. Times use the timezone set there.
4. You can also message the bot: `/heute`, `/aufgaben`, `/aufgabe <title>`, `/erinnerung 18:00 <text>`, `/erinnerung in 30m <text>`, `/erinnerung morgen 9:00 <text>`, `/erinnerungen`, `/notiz <text>` (English: `/today`, `/tasks`, `/task`, `/remind`, `/reminders`, `/note`).

The bot uses long polling, so no public domain or webhook is needed – the API just has to be running. MCP clients can use `create_reminder`, `list_reminders` and `send_telegram_message`.

For quick local development without Postgres you can start the API with `DATABASE_URL=sqlite:///./plm.sqlite3`.
