"""The signed-in account of the current request (set by AccessGuardMiddleware)."""

from contextvars import ContextVar

from fastapi import HTTPException, status

from app.services.accounts import Identity, is_multi_user

_identity: ContextVar[Identity | None] = ContextVar("identity", default=None)


def bearer_token(header: str | None) -> str:
    if not header:
        return ""
    scheme, _, value = header.partition(" ")
    return value.strip() if scheme.lower() == "bearer" else ""


def set_identity(identity: Identity | None) -> object:
    return _identity.set(identity)


def reset_identity(token: object) -> None:
    _identity.reset(token)  # type: ignore[arg-type]


def current_identity() -> Identity | None:
    return _identity.get()


def require_identity() -> Identity:
    """FastAPI dependency for account endpoints (multi-user mode only)."""
    if not is_multi_user():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Accounts are switched off (AUTH_MODE=single).")
    identity = _identity.get()
    if identity is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")
    return identity


def require_admin() -> Identity:
    identity = require_identity()
    if not identity.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can manage accounts.")
    return identity
