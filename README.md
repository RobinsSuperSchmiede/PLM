# PLM

Personal Life Manager is a local-first AI platform designed to organize projects, tasks, calendar events, notes, ideas, and knowledge in a single personal workspace.

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

## Current scope

This repository establishes the architecture and baseline implementation for a modular, local-first AI platform. It includes a dark-mode Next.js dashboard shell, a structured FastAPI API with health endpoints, and the supporting project layout needed for future AI and MCP tooling.
