"""Accounts, passwords and sign-in sessions (multi-user mode).

- Passwords are hashed with scrypt (standard library), never stored or logged in plain text.
- A sign-in returns a random access token; only its SHA-256 is stored, so a leaked database
  does not contain usable tokens. Tokens expire after SESSION_DAYS without use.
- Each account owns a workspace (see app.db.session). The first account takes over the default
  workspace, i.e. the data that existed before accounts were switched on.
"""

import base64
import hashlib
import hmac
import re
import secrets
import shutil
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select

from app.core.config import get_settings
from app.db.session import DEFAULT_WORKSPACE, AccountsSession, dispose_workspace, use_workspace, workspace_dir
from app.models.account import AuthSession, PendingLogin, User
from app.models.base import utcnow

USERNAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{1,31}$")
MIN_PASSWORD = 8
MAX_PASSWORD = 256
PENDING_LIFETIME = timedelta(minutes=10)
# Failed sign-ins per username (and per client) within the window before further attempts are refused.
MAX_FAILURES = 8
FAILURE_WINDOW = 15 * 60
# last_used_at is written at most this often per session.
TOUCH_INTERVAL = timedelta(minutes=5)
CACHE_SECONDS = 30.0

_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


class AccountError(ValueError):
    """Invalid input (shown to the user)."""


class RateLimitedError(Exception):
    pass


@dataclass(frozen=True)
class Identity:
    user_id: uuid.UUID
    session_id: uuid.UUID
    username: str
    is_admin: bool
    workspace: str


# --- Passwords ---------------------------------------------------------------------------------


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt), n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Compared against when the username does not exist, so both cases take the same time.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def check_password_rules(password: str) -> None:
    if len(password) < MIN_PASSWORD:
        raise AccountError(f"The password must have at least {MIN_PASSWORD} characters.")
    if len(password) > MAX_PASSWORD:
        raise AccountError("The password is too long.")


def normalize_username(username: str) -> str:
    value = username.strip().lower()
    if not USERNAME_PATTERN.match(value):
        raise AccountError("Usernames have 2–32 characters: letters, digits, dot, dash and underscore.")
    return value


# --- Failed attempts ---------------------------------------------------------------------------

_failures: dict[str, list[float]] = {}
_failures_lock = threading.Lock()


def _recent_failures(key: str, now: float) -> list[float]:
    attempts = [at for at in _failures.get(key, []) if now - at < FAILURE_WINDOW]
    if attempts:
        _failures[key] = attempts
    else:
        _failures.pop(key, None)
    return attempts


def _check_rate(*keys: str) -> None:
    now = time.monotonic()
    with _failures_lock:
        if any(len(_recent_failures(key, now)) >= MAX_FAILURES for key in keys if key):
            raise RateLimitedError("Too many failed sign-ins. Try again in a few minutes.")


def _record_failure(*keys: str) -> None:
    now = time.monotonic()
    with _failures_lock:
        for key in keys:
            if key:
                _failures.setdefault(key, []).append(now)


def _clear_failures(*keys: str) -> None:
    with _failures_lock:
        for key in keys:
            _failures.pop(key, None)


def reset_rate_limits() -> None:
    with _failures_lock:
        _failures.clear()


# --- Users -------------------------------------------------------------------------------------


def is_multi_user() -> bool:
    return get_settings().auth_mode == "multi"


def user_count() -> int:
    with AccountsSession() as db:
        return db.scalar(select(func.count()).select_from(User)) or 0


def find_user(username: str) -> User | None:
    with AccountsSession() as db:
        return db.scalar(select(User).where(User.username == username.strip().lower()))


def get_user(user_id: uuid.UUID) -> User | None:
    with AccountsSession() as db:
        return db.get(User, user_id)


def list_users() -> list[User]:
    with AccountsSession() as db:
        return list(db.scalars(select(User).order_by(User.created_at)))


def active_workspaces() -> list[str]:
    """Workspaces the scheduler and MCP serve: the default one, or one per enabled account."""
    if not is_multi_user():
        return [DEFAULT_WORKSPACE]
    with AccountsSession() as db:
        return list(db.scalars(select(User.workspace).where(User.disabled.is_(False)).order_by(User.created_at)))


def create_user(username: str, password: str, *, display_name: str | None = None, is_admin: bool = False) -> User:
    name = normalize_username(username)
    check_password_rules(password)
    with AccountsSession() as db:
        if db.scalar(select(User.id).where(User.username == name)) is not None:
            raise AccountError("This username is already taken.")
        first = (db.scalar(select(func.count()).select_from(User)) or 0) == 0
        taken = set(db.scalars(select(User.workspace)))
        user = User(
            username=name,
            display_name=(display_name or "").strip() or None,
            password_hash=hash_password(password),
            # The very first account is always an admin and keeps the existing data.
            is_admin=is_admin or first,
            workspace=DEFAULT_WORKSPACE if first and DEFAULT_WORKSPACE not in taken else uuid.uuid4().hex,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    # Create the workspace database right away, so the account starts with an empty, migrated workspace.
    from app.db.session import engine_for

    engine_for(user.workspace)
    return user


def update_user(
    user_id: uuid.UUID,
    *,
    display_name: str | None = None,
    is_admin: bool | None = None,
    disabled: bool | None = None,
    password: str | None = None,
    acting_user: uuid.UUID | None = None,
) -> User:
    with AccountsSession() as db:
        user = db.get(User, user_id)
        if user is None:
            raise LookupError("User not found")
        if display_name is not None:
            user.display_name = display_name.strip() or None
        demote = (is_admin is False and user.is_admin) or (disabled is True and user.is_admin and not user.disabled)
        if demote and _admin_count(db) <= 1:
            raise AccountError("At least one active admin account is required.")
        if acting_user == user.id and (is_admin is False or disabled is True):
            raise AccountError("You cannot remove your own admin rights or disable your own account.")
        if is_admin is not None:
            user.is_admin = is_admin
        if disabled is not None:
            user.disabled = disabled
        if password is not None:
            check_password_rules(password)
            user.password_hash = hash_password(password)
        if disabled or password is not None:
            # A new password or a disabled account signs out every browser of that account.
            db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        db.commit()
        db.refresh(user)
    _clear_cache()
    return user


def _admin_count(db) -> int:  # type: ignore[no-untyped-def]
    return db.scalar(select(func.count()).select_from(User).where(User.is_admin.is_(True), User.disabled.is_(False))) or 0


def delete_user(user_id: uuid.UUID, *, acting_user: uuid.UUID | None = None) -> None:
    """Deletes the account and its workspace. The default workspace's data is kept on disk."""
    with AccountsSession() as db:
        user = db.get(User, user_id)
        if user is None:
            raise LookupError("User not found")
        if acting_user == user.id:
            raise AccountError("You cannot delete your own account.")
        if user.is_admin and not user.disabled and _admin_count(db) <= 1:
            raise AccountError("At least one active admin account is required.")
        workspace = user.workspace
        db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
        db.execute(delete(PendingLogin).where(PendingLogin.user_id == user.id))
        db.delete(user)
        db.commit()
    _clear_cache()
    if workspace != DEFAULT_WORKSPACE:
        dispose_workspace(workspace)
        shutil.rmtree(workspace_dir(workspace), ignore_errors=True)
        _drop_schema(workspace)


def _drop_schema(workspace: str) -> None:
    url = get_settings().sqlalchemy_url
    if url.startswith("sqlite"):
        return
    from sqlalchemy import create_engine, text

    engine = create_engine(url, future=True)
    try:
        with engine.begin() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "ws_{workspace}" CASCADE'))
    finally:
        engine.dispose()


def change_password(user_id: uuid.UUID, current: str, new: str, *, keep_session: uuid.UUID | None = None) -> None:
    with AccountsSession() as db:
        user = db.get(User, user_id)
        if user is None:
            raise LookupError("User not found")
        if not verify_password(current, user.password_hash):
            raise AccountError("The current password is wrong.")
        check_password_rules(new)
        user.password_hash = hash_password(new)
        # Every other browser is signed out; the one that changed the password stays signed in.
        statement = delete(AuthSession).where(AuthSession.user_id == user.id)
        if keep_session:
            statement = statement.where(AuthSession.id != keep_session)
        db.execute(statement)
        db.commit()
    _clear_cache()


# --- Sign-in -----------------------------------------------------------------------------------


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


@dataclass
class LoginResult:
    user: User
    token: str | None = None
    expires_at: datetime | None = None
    pending_token: str | None = None
    challenge_expires_at: datetime | None = None


def authenticate(username: str, password: str, *, client: str = "") -> User:
    """Checks the password; raises AccountError (wrong) or RateLimitedError (too many attempts)."""
    name = username.strip().lower()[:64]
    _check_rate(f"user:{name}", f"client:{client}")
    user = find_user(name) if name else None
    valid = verify_password(password[:MAX_PASSWORD], user.password_hash if user else _DUMMY_HASH)
    if not valid or user is None or user.disabled:
        _record_failure(f"user:{name}", f"client:{client}")
        raise AccountError("Wrong username or password.")
    _clear_failures(f"user:{name}")
    return user


def start_session(user: User, *, user_agent: str | None = None) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    now = utcnow()
    expires_at = now + timedelta(days=get_settings().session_days)
    with AccountsSession() as db:
        db.execute(delete(AuthSession).where(AuthSession.expires_at < now))
        db.add(AuthSession(token_hash=_token_hash(token), user_id=user.id, created_at=now, last_used_at=now, expires_at=expires_at, user_agent=(user_agent or "")[:255] or None))
        stored = db.get(User, user.id)
        if stored is not None:
            stored.last_login_at = now
        db.commit()
    return token, expires_at


def login(username: str, password: str, *, client: str = "", user_agent: str | None = None) -> LoginResult:
    """Step 1. Returns an access token, or – if Telegram two-factor login is on – a pending token."""
    from app.services import login_2fa

    user = authenticate(username, password, client=client)
    with use_workspace(user.workspace):
        from app.db.session import SessionLocal

        with SessionLocal() as db:
            second_factor = login_2fa.is_required(db)
            challenge = login_2fa.create_challenge(db) if second_factor else None
    if challenge is None:
        token, expires_at = start_session(user, user_agent=user_agent)
        return LoginResult(user=user, token=token, expires_at=expires_at)
    pending = secrets.token_urlsafe(32)
    with AccountsSession() as db:
        db.execute(delete(PendingLogin).where(PendingLogin.expires_at < utcnow()))
        db.add(PendingLogin(token_hash=_token_hash(pending), user_id=user.id, challenge_id=challenge.id, expires_at=utcnow() + PENDING_LIFETIME, user_agent=(user_agent or "")[:255] or None))
        db.commit()
    return LoginResult(user=user, pending_token=pending, challenge_expires_at=challenge.expires_at)


def _pending(db, pending_token: str) -> PendingLogin | None:  # type: ignore[no-untyped-def]
    row = db.get(PendingLogin, _token_hash(pending_token))
    if row is None or _aware(row.expires_at) < utcnow():
        return None
    return row


def verify_second_factor(pending_token: str, code: str) -> tuple[LoginResult | None, int]:
    """Step 2. Returns (result with access token or None, remaining attempts)."""
    from app.db.session import SessionLocal
    from app.services import login_2fa

    with AccountsSession() as db:
        row = _pending(db, pending_token)
        if row is None:
            return None, 0
        user = db.get(User, row.user_id)
        challenge_id, user_agent = row.challenge_id, row.user_agent
    if user is None or user.disabled:
        return None, 0
    with use_workspace(user.workspace), SessionLocal() as wdb:
        valid, remaining = login_2fa.verify(wdb, challenge_id, code)
    if not valid:
        return None, remaining
    with AccountsSession() as db:
        db.execute(delete(PendingLogin).where(PendingLogin.token_hash == _token_hash(pending_token)))
        db.commit()
    token, expires_at = start_session(user, user_agent=user_agent)
    return LoginResult(user=user, token=token, expires_at=expires_at), remaining


def resend_second_factor(pending_token: str) -> datetime | None:
    """Sends a new Telegram code for a pending sign-in. None if the sign-in expired."""
    from app.db.session import SessionLocal
    from app.services import login_2fa

    with AccountsSession() as db:
        row = _pending(db, pending_token)
        if row is None:
            return None
        user = db.get(User, row.user_id)
        if user is None:
            return None
        with use_workspace(user.workspace), SessionLocal() as wdb:
            challenge = login_2fa.create_challenge(wdb)
        row.challenge_id = challenge.id
        row.resends += 1
        row.expires_at = utcnow() + PENDING_LIFETIME
        db.commit()
        return challenge.expires_at


# --- Sessions ----------------------------------------------------------------------------------

_cache: dict[str, tuple[float, Identity]] = {}
_cache_lock = threading.Lock()


def _clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def resolve_token(token: str) -> Identity | None:
    """Identity of a valid access token, or None. Results are cached briefly."""
    if not token or len(token) > 128:
        return None
    key = _token_hash(token)
    now_mono = time.monotonic()
    with _cache_lock:
        cached = _cache.get(key)
        if cached and now_mono - cached[0] < CACHE_SECONDS:
            return cached[1]
    now = utcnow()
    with AccountsSession() as db:
        row = db.scalar(select(AuthSession).where(AuthSession.token_hash == key))
        if row is None or _aware(row.expires_at) < now:
            return None
        user = db.get(User, row.user_id)
        if user is None or user.disabled:
            return None
        if now - _aware(row.last_used_at) > TOUCH_INTERVAL:
            # Sliding expiry: a session in use does not run out.
            row.last_used_at = now
            row.expires_at = now + timedelta(days=get_settings().session_days)
            db.commit()
        identity = Identity(user_id=user.id, session_id=row.id, username=user.username, is_admin=user.is_admin, workspace=user.workspace)
    with _cache_lock:
        _cache[key] = (now_mono, identity)
    return identity


def end_session(token: str) -> None:
    with AccountsSession() as db:
        db.execute(delete(AuthSession).where(AuthSession.token_hash == _token_hash(token)))
        db.commit()
    _clear_cache()


def list_sessions(user_id: uuid.UUID) -> list[AuthSession]:
    with AccountsSession() as db:
        return list(db.scalars(select(AuthSession).where(AuthSession.user_id == user_id, AuthSession.expires_at >= utcnow()).order_by(AuthSession.last_used_at.desc())))


def revoke_session(user_id: uuid.UUID, session_id: uuid.UUID) -> bool:
    with AccountsSession() as db:
        result = db.execute(delete(AuthSession).where(AuthSession.user_id == user_id, AuthSession.id == session_id))
        db.commit()
    _clear_cache()
    return bool(result.rowcount)  # type: ignore[attr-defined]
