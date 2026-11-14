# Architecture

PLM is organized as a monorepo with clear separation between user-facing product surfaces and core platform services.

## Application boundaries

- `apps/web`: dashboard and operational UI
- `apps/api`: backend API and shared domain logic
- `services/agent-runtime`: local execution environment for autonomous or assistance-focused agent workflows
- `services/mcp-server`: model context protocol server for controlled tool access
- `packages/shared-contracts`: shared schemas and machine-readable contracts
- `docs`: architecture and operational guidance
- `infrastructure/docker`: runtime and deployment helpers

## Architectural principles

1. Local-first by default.
2. Clear boundaries between UI, domain logic, and storage.
3. Strong validation and typed interfaces.
4. Optional async database access where it helps.
5. Clean path for future AI orchestration and tool access.

## Loading and syncing the workspace

- The web app keeps the whole workspace in memory. On the first start it loads it with one request,
  `GET /api/v1/bootstrap` (all collections, settings, tags, links).
- The loaded state is stored in the browser (IndexedDB, `lib/snapshot-store.ts`). On later starts the
  cached state is shown at once and `GET /api/v1/sync?since=<server_time>` fetches only what changed:
  per collection the ids that exist now (in list order) plus the entries modified since then. Entries
  whose id is no longer listed were deleted or archived. If the cache does not fit the server, the app
  falls back to `/bootstrap`.
- `/api/v1/*` is not handled by a Next route: `apps/web/middleware.ts` checks the access cookie and
  rewrites the request straight to the FastAPI backend (`/api/v1/auth/*` stays unreachable from the browser).
- Long lists (tasks, notes, documents) are virtualized (`components/virtual-list.tsx`), the graph layout
  runs in a web worker (`lib/graph-layout.worker.ts`), and image lists use `GET /files/{id}/thumbnail`.
- SQLite runs in WAL mode: besides `plm.sqlite3` there are `-wal` and `-shm` files. Back up all three
  (or stop the API first), not just the main file.
