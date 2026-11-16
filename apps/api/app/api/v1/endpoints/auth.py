"""Sign-in. Called by the web app's server only (its browser proxy blocks /auth), which keeps the
access token in an httpOnly cookie and sends it back as ``Authorization: Bearer``."""

from datetime import datetime

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.services import accounts, login_2fa
from app.services.account_context import bearer_token

router = APIRouter(prefix="/auth", tags=["auth"])


class UserRead(BaseModel):
    id: str
    username: str
    display_name: str | None
    is_admin: bool


def user_read(user: accounts.User) -> UserRead:  # type: ignore[name-defined]
    return UserRead(id=str(user.id), username=user.username, display_name=user.display_name, is_admin=user.is_admin)


class Credentials(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)
    display_name: str | None = Field(default=None, max_length=120)
    user_agent: str | None = Field(default=None, max_length=512)
    client: str | None = Field(default=None, max_length=128)


class VerifyRequest(BaseModel):
    pending_token: str = Field(..., min_length=10, max_length=128)
    code: str = Field(..., pattern=r"^\d{6}$")


class ResendRequest(BaseModel):
    pending_token: str = Field(..., min_length=10, max_length=128)


class LoginResponse(BaseModel):
    token: str | None = None
    expires_at: datetime | None = None  # always timezone-aware (set in Python, not read back)
    user: UserRead | None = None
    second_factor: str | None = None
    pending_token: str | None = None
    challenge_expires_at: datetime | None = None


def _require_multi() -> None:
    if not accounts.is_multi_user():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Accounts are switched off (AUTH_MODE=single).")


def _result(result: accounts.LoginResult) -> LoginResponse:
    if result.token:
        return LoginResponse(token=result.token, expires_at=result.expires_at, user=user_read(result.user))
    return LoginResponse(second_factor="telegram", pending_token=result.pending_token, challenge_expires_at=result.challenge_expires_at)


@router.get("/status")
def auth_status(request: Request) -> dict[str, object]:
    """Mode of this installation and – with a valid token – the signed-in account."""
    if not accounts.is_multi_user():
        return {"mode": "single", "setup_required": False, "user": None}
    identity = accounts.resolve_token(bearer_token(request.headers.get("authorization")))
    user = accounts.get_user(identity.user_id) if identity else None
    return {
        "mode": "multi",
        "setup_required": accounts.user_count() == 0,
        "user": user_read(user).model_dump() if user else None,
        "session_days": get_settings().session_days,
    }


@router.post("/setup", response_model=LoginResponse)
def setup(payload: Credentials) -> LoginResponse:
    """Creates the first (admin) account. Only possible while no account exists."""
    _require_multi()
    if accounts.user_count() > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Setup is already done.")
    try:
        user = accounts.create_user(payload.username, payload.password, display_name=payload.display_name, is_admin=True)
    except accounts.AccountError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    token, expires_at = accounts.start_session(user, user_agent=payload.user_agent)
    return LoginResponse(token=token, expires_at=expires_at, user=user_read(user))


@router.post("/login", response_model=LoginResponse)
def login(payload: Credentials) -> LoginResponse:
    _require_multi()
    try:
        result = accounts.login(payload.username, payload.password, client=payload.client or "", user_agent=payload.user_agent)
    except accounts.RateLimitedError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc)) from exc
    except accounts.AccountError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
    except login_2fa.ChallengeError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS if "Too many" in str(exc) else status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return _result(result)


@router.post("/verify")
def verify(payload: VerifyRequest) -> dict[str, object]:
    _require_multi()
    result, remaining = accounts.verify_second_factor(payload.pending_token, payload.code)
    if result is None:
        return {"valid": False, "remaining": remaining}
    return {"valid": True, "remaining": remaining, **_result(result).model_dump(mode="json")}


@router.post("/resend")
def resend(payload: ResendRequest) -> dict[str, object]:
    _require_multi()
    try:
        expires_at = accounts.resend_second_factor(payload.pending_token)
    except login_2fa.ChallengeError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS if "Too many" in str(exc) else status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    if expires_at is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign-in expired.")
    return {"resent": True, "expires_at": expires_at}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request) -> None:
    token = bearer_token(request.headers.get("authorization"))
    if token:
        accounts.end_session(token)
