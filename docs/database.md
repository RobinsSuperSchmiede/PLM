# Database

The default database backend is PostgreSQL.

## Current direction

- Use UUID primary keys for system entities.
- Ensure timestamps for `created_at` and `updated_at`.
- Keep domain responsibilities separated between repositories and services.
- Prefer SQLAlchemy 2.x models and migration-backed schema evolution.
