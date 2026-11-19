# Security policy

Anamnesies stores personal data – notes, tasks, calendars, files – and exposes it to AI assistants over MCP. We take security reports seriously.

## Supported versions

Anamnesies is developed on `main`; there are no maintained release branches yet. Security fixes land on `main` and in the next desktop release (`desktop-v*` tags).

| Version | Supported |
|---|---|
| `main` / latest desktop release | ✅ |
| older desktop releases | ❌ – please update |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report it privately through GitHub: **Security → Report a vulnerability** in this repository ([direct link](https://github.com/RobinsSuperSchmiede/PLM/security/advisories/new)). Please include:

- what is affected (web app, API, MCP server, Telegram bot, desktop app, Docker setup),
- steps to reproduce or a proof of concept,
- the impact you expect (e.g. data of another workspace readable, sign-in bypass),
- the version or commit you tested.

What to expect:

- an acknowledgement within **7 days**,
- an assessment and a plan within **30 days**,
- a fix and a published advisory crediting you (unless you prefer not to be named).

Please give us a reasonable time to fix the issue before disclosing it, and only test against installations you own. Do not access or modify data of other people.

## Scope

In scope: everything in this repository – authentication and sessions, workspace separation between accounts, the MCP server and its token handling, file uploads, the Telegram integration, the desktop app scripts and the Docker setup.

Out of scope: vulnerabilities in third-party services (Telegram, AI providers), issues that need an already compromised machine, and missing hardening of a self-hosted server you configured yourself (e.g. exposing port 8000 to the internet).

## Hardening notes for self-hosting

- Keep `AUTH_MODE=multi` (the default) on any machine others can reach; `single` disables sign-in.
- Expose only the web app (port 3000) through HTTPS; the API on port 8000 should stay local.
- Change the default database passwords from `.env.example`.
- Keep the MCP token secret and rotate it under Settings → MCP if it may have leaked.

See also [`docs/security.md`](docs/security.md).
