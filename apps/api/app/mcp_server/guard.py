"""ASGI middleware that decides which hosts may reach the REST API and the MCP endpoint, and which
workspace a request works on.

- The REST API (/api, /docs, ...) is only served to trusted local hosts; the web app proxies to it.
- In multi-user mode every /api/v1 request (except health and sign-in) needs the access token of a
  signed-in account (``Authorization: Bearer``); the request then works on that account's workspace.
- /mcp is additionally reachable via the custom domain(s) from the settings and is protected by a
  bearer token. In multi-user mode the MCP token also selects the workspace, so it is always required.
"""

import json
import secrets
import threading
import time
from urllib.parse import urlsplit

import anyio
from starlette.types import ASGIApp, Receive, Scope, Send

from app.core.config import get_settings
from app.db.session import DEFAULT_WORKSPACE, SessionLocal, reset_workspace, set_workspace, use_workspace
from app.services import accounts, usage
from app.services.account_context import bearer_token, reset_identity, set_identity
from app.services.app_settings import LOCAL_HOSTS, allowed_mcp_hosts, get_app_settings

# Reachable without signing in (multi-user mode).
PUBLIC_API = ("/api/v1/health", "/api/v1/ready", "/api/v1/auth/")


def _hostname(value: str) -> str:
    value = value.strip().lower()
    if not value:
        return ""
    return (urlsplit(f"//{value}").hostname or "").lower()


def _load_mcp_policy(workspace: str) -> tuple[bool, bool, str | None, set[str]]:
    with use_workspace(workspace):
        db = SessionLocal()
        try:
            row = get_app_settings(db)
            return row.mcp_enabled, row.mcp_require_token, row.mcp_token, allowed_mcp_hosts(row)
        finally:
            db.close()


class _McpTokens:
    """MCP token -> workspace for multi-user mode, rebuilt when a token is not known (at most once per second)."""

    def __init__(self) -> None:
        self._map: dict[str, str] = {}
        self._built = 0.0
        self._lock = threading.Lock()

    def _build(self) -> None:
        mapping: dict[str, str] = {}
        for workspace in accounts.active_workspaces():
            token = _load_mcp_policy(workspace)[2]
            if token:
                mapping[token] = workspace
        self._map = mapping
        self._built = time.monotonic()

    def lookup(self, token: str) -> str | None:
        if not token:
            return None
        with self._lock:
            age = time.monotonic() - self._built
            if age > 30 or (age > 1 and not any(secrets.compare_digest(token, known) for known in self._map)):
                self._build()
            for known, workspace in self._map.items():
                if secrets.compare_digest(token.encode(), known.encode()):
                    return workspace
        return None


_mcp_tokens = _McpTokens()

BROWSER_API = "/api/v1/browser/"
BROWSER_TOKEN_HEADER = "x-anamnesies-token"


def _load_browser_token(workspace: str) -> str | None:
    with use_workspace(workspace):
        db = SessionLocal()
        try:
            return get_app_settings(db).browser_token
        finally:
            db.close()


class _BrowserTokens(_McpTokens):
    """Browser extension token -> workspace (the default workspace in single-user mode)."""

    def _build(self) -> None:
        workspaces = accounts.active_workspaces() if accounts.is_multi_user() else [DEFAULT_WORKSPACE]
        mapping: dict[str, str] = {}
        for workspace in workspaces:
            token = _load_browser_token(workspace)
            if token:
                mapping[token] = workspace
        self._map = mapping
        self._built = time.monotonic()


_browser_tokens = _BrowserTokens()


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
        multi = accounts.is_multi_user()
        workspace = DEFAULT_WORKSPACE
        identity = None

        if path == "/mcp" or path.startswith("/mcp/"):
            # Requests proxied by the local web app carry the public host in X-Forwarded-Host.
            if host in self.trusted_hosts and headers.get("x-forwarded-host"):
                host = _hostname(headers["x-forwarded-host"])
            provided = bearer_token(headers.get("authorization"))
            if multi:
                found = await anyio.to_thread.run_sync(_mcp_tokens.lookup, provided)
                if found is None:
                    await _reject(send, 401, "Missing or invalid MCP token.", [(b"www-authenticate", b"Bearer")])
                    return
                workspace = found
            enabled, require_token, token, allowed = await anyio.to_thread.run_sync(_load_mcp_policy, workspace)
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
            if require_token or multi:
                if not token or not secrets.compare_digest(provided.encode(), token.encode()):
                    await _reject(send, 401, "Missing or invalid MCP token.", [(b"www-authenticate", b"Bearer")])
                    return
            usage.count("mcp", workspace)
        elif host not in self.trusted_hosts:
            await _reject(send, 403, "The REST API is only available locally. Use /mcp for remote access.")
            return
        elif path.startswith("/api/v1"):
            browser_token = headers.get(BROWSER_TOKEN_HEADER, "").strip()
            if browser_token and path.startswith(BROWSER_API):
                # The browser extension: its token opens /api/v1/browser/* of one workspace, nothing else.
                found = await anyio.to_thread.run_sync(_browser_tokens.lookup, browser_token)
                if found is None:
                    await _reject(send, 401, "Invalid browser extension token.")
                    return
                workspace = found
            elif multi and not path.startswith(PUBLIC_API):
                identity = await anyio.to_thread.run_sync(accounts.resolve_token, bearer_token(headers.get("authorization")))
                if identity is None:
                    await _reject(send, 401, "Not signed in.", [(b"www-authenticate", b"Bearer")])
                    return
                workspace = identity.workspace
            if not path.endswith(("/health", "/stats")) and not path.startswith("/api/v1/auth/"):
                usage.count("api", workspace)

        workspace_token = set_workspace(workspace)
        identity_token = set_identity(identity)
        try:
            await self.app(scope, receive, send)
        finally:
            reset_identity(identity_token)
            reset_workspace(workspace_token)
