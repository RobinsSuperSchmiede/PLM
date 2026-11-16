"""The signed-in account (profile, password, sessions) and, for admins, the list of accounts."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import AfterValidator, BaseModel, Field
from typing import Annotated

from app.api.v1.endpoints.auth import UserRead, user_read
from app.services import accounts
from app.services.account_context import require_admin, require_identity
from app.services.accounts import Identity

router = APIRouter(tags=["account"])

# SQLite returns timestamps without a zone; they are stored in UTC.
UtcDatetime = Annotated[datetime, AfterValidator(lambda value: value if value.tzinfo else value.replace(tzinfo=timezone.utc))]


class AccountRead(UserRead):
    created_at: UtcDatetime
    last_login_at: UtcDatetime | None


class AdminUserRead(AccountRead):
    disabled: bool
    is_self: bool


class AccountUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)


class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=1, max_length=256)


class SessionRead(BaseModel):
    id: uuid.UUID
    created_at: UtcDatetime
    last_used_at: UtcDatetime
    expires_at: UtcDatetime
    user_agent: str | None
    current: bool


class UserCreate(BaseModel):
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)
    display_name: str | None = Field(default=None, max_length=120)
    is_admin: bool = False


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=120)
    is_admin: bool | None = None
    disabled: bool | None = None
    password: str | None = Field(default=None, min_length=1, max_length=256)


def _account(user: accounts.User) -> AccountRead:  # type: ignore[name-defined]
    return AccountRead(**user_read(user).model_dump(), created_at=user.created_at, last_login_at=user.last_login_at)


def _admin_view(user: accounts.User, identity: Identity) -> AdminUserRead:  # type: ignore[name-defined]
    return AdminUserRead(**_account(user).model_dump(), disabled=user.disabled, is_self=user.id == identity.user_id)


def _load(identity: Identity) -> accounts.User:  # type: ignore[name-defined]
    user = accounts.get_user(identity.user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in.")
    return user


@router.get("/account", response_model=AccountRead)
def read_account(identity: Identity = Depends(require_identity)) -> AccountRead:
    return _account(_load(identity))


@router.patch("/account", response_model=AccountRead)
def update_account(payload: AccountUpdate, identity: Identity = Depends(require_identity)) -> AccountRead:
    return _account(accounts.update_user(identity.user_id, display_name=payload.display_name or ""))


@router.post("/account/password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(payload: PasswordChange, identity: Identity = Depends(require_identity)) -> Response:
    try:
        accounts.change_password(identity.user_id, payload.current_password, payload.new_password, keep_session=identity.session_id)
    except accounts.AccountError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/account/sessions", response_model=list[SessionRead])
def list_sessions(identity: Identity = Depends(require_identity)) -> list[SessionRead]:
    return [
        SessionRead(id=row.id, created_at=row.created_at, last_used_at=row.last_used_at, expires_at=row.expires_at, user_agent=row.user_agent, current=row.id == identity.session_id)
        for row in accounts.list_sessions(identity.user_id)
    ]


@router.delete("/account/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(session_id: uuid.UUID, identity: Identity = Depends(require_identity)) -> Response:
    if not accounts.revoke_session(identity.user_id, session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Admin: accounts ---------------------------------------------------------------------------


@router.get("/users", response_model=list[AdminUserRead])
def list_users(identity: Identity = Depends(require_admin)) -> list[AdminUserRead]:
    return [_admin_view(user, identity) for user in accounts.list_users()]


@router.post("/users", response_model=AdminUserRead, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, identity: Identity = Depends(require_admin)) -> AdminUserRead:
    try:
        user = accounts.create_user(payload.username, payload.password, display_name=payload.display_name, is_admin=payload.is_admin)
    except accounts.AccountError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _admin_view(user, identity)


@router.patch("/users/{user_id}", response_model=AdminUserRead)
def update_user(user_id: uuid.UUID, payload: UserUpdate, identity: Identity = Depends(require_admin)) -> AdminUserRead:
    try:
        user = accounts.update_user(
            user_id,
            display_name=payload.display_name,
            is_admin=payload.is_admin,
            disabled=payload.disabled,
            password=payload.password,
            acting_user=identity.user_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except accounts.AccountError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return _admin_view(user, identity)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: uuid.UUID, identity: Identity = Depends(require_admin)) -> Response:
    try:
        accounts.delete_user(user_id, acting_user=identity.user_id)
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except accounts.AccountError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
