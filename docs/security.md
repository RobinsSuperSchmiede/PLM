# Security

## Principles

- Keep secrets in `.env` or a managed secret layer.
- Validate all inbound data using Pydantic and Zod.
- Restrict CORS to trusted local origins.
- Log operational events without exposing sensitive data.
- Keep AI runtime access isolated behind explicit service boundaries.
