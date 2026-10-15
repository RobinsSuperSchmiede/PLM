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
