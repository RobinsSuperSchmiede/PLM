"""ASGI middleware that decides which hosts may reach the REST API and the MCP endpoint.

- The REST API (/api, /docs, ...) is only served to trusted local hosts; the web app proxies to it.
- /mcp is additionally reachable via the custom domain(s) from the settings and is protected by a
  bearer token unless the token requirement is disabled.
"""

import json
import secrets
from urllib.parse import urlsplit

import anyio
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.services.app_settings import LOCAL_HOSTS, allowed_mcp_hosts, get_app_settings


def _hostname(value: str) -> str:
    value = value.strip().lower()
    if not value:
        return ""
    return (urlsplit(f"//{value}").hostname or "").lower()


def _load_mcp_policy() -> tuple[bool, bool, str | None, set[str]]:
    db = SessionLocal()
    try:
        row = get_app_settings(db)
        return row.mcp_enabled, row.mcp_require_token, row.mcp_token, allowed_mcp_hosts(row)
    finally:
        db.close()


async def _reject(send: Send, status: int, message: str, headers: list[tuple[bytes, bytes]] | None = None) -> None:
    body = json.dumps({"detail": message}).encode()
    await send({
        "type": "http.response.start",
        "status": status,
        "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode()), *(headers or [])],
    })
    await send({"type": "http.response.body", "body": body})


class AccessGuardMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app
        settings = get_settings()
        self.trusted_hosts = LOCAL_HOSTS | {"api"} | {host.lower() for host in settings.mcp_allowed_hosts}

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.decode().lower(): value.decode() for key, value in scope["headers"]}
        host = _hostname(headers.get("host", ""))
        path: str = scope["path"]

        if path == "/mcp" or path.startswith("/mcp/"):
            # Requests proxied by the local web app carry the public host in X-Forwarded-Host.
            if host in self.trusted_hosts and headers.get("x-forwarded-host"):
                host = _hostname(headers["x-forwarded-host"])
            enabled, require_token, token, allowed = await anyio.to_thread.run_sync(_load_mcp_policy)
            if not enabled:
                await _reject(send, 503, "MCP server is disabled in the settings.")
                return
            if host not in allowed:
                await _reject(send, 403, f"Host '{host}' is not allowed for MCP. Add it as custom domain in the settings.")
                return
            origin = headers.get("origin")
            if origin and _hostname(urlsplit(origin).netloc) not in allowed:
                await _reject(send, 403, "Origin not allowed.")
                return
            if require_token:
                provided = headers.get("authorization", "")
                expected = f"Bearer {token}" if token else ""
                if not expected or not secrets.compare_digest(provided.encode(), expected.encode()):
                    await _reject(send, 401, "Missing or invalid MCP token.", [(b"www-authenticate", b"Bearer")])
                    return
        elif host not in self.trusted_hosts:
            await _reject(send, 403, "The REST API is only available locally. Use /mcp for remote access.")
            return

        await self.app(scope, receive, send)
