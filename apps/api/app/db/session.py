"""Database access per workspace.

Every user has a workspace of their own: a separate SQLite file (or, with PostgreSQL, a separate schema)
plus an upload folder. The workspace of the current request is held in a context variable, so all
existing code that opens ``SessionLocal()`` transparently works on the right database.

- ``default`` is the database from DATABASE_URL. It is the only workspace in single-user mode, and the
  workspace of the first account in multi-user mode (so existing data stays with the admin).
- Other workspaces live in WORKSPACES_DIR/<key>/ (SQLite) or in the schema ``ws_<key>`` (PostgreSQL).
"""

import re
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from pathlib import Path

from sqlalchemy import Engine, MetaData, create_engine, event, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import CreateColumn

from app.core.config import API_ROOT, get_settings

DEFAULT_WORKSPACE = "default"
ACCOUNTS = "__accounts__"
_KEY_PATTERN = re.compile(r"^[a-z0-9_]{1,40}$")

_workspace: ContextVar[str] = ContextVar("workspace", default=DEFAULT_WORKSPACE)
_engines: dict[str, Engine] = {}
_lock = threading.RLock()
_factory = sessionmaker(autoflush=False, autocommit=False, expire_on_commit=False, future=True)


def current_workspace() -> str:
    return _workspace.get()


def set_workspace(key: str) -> object:
    _check_key(key)
    return _workspace.set(key)


def reset_workspace(token: object) -> None:
    _workspace.reset(token)  # type: ignore[arg-type]


@contextmanager
def use_workspace(key: str) -> Iterator[None]:
    """Run the block against another workspace (scheduler, login, MCP)."""
    token = set_workspace(key)
    try:
        yield
    finally:
        reset_workspace(token)


def _check_key(key: str) -> None:
    if key != ACCOUNTS and not _KEY_PATTERN.match(key):
        raise ValueError(f"Invalid workspace key: {key!r}")


def workspaces_root() -> Path:
    path = Path(get_settings().workspaces_dir)
    return path if path.is_absolute() else API_ROOT / path


def workspace_dir(key: str) -> Path:
    """Folder of a user workspace (its SQLite file and uploads). Not used for the default workspace."""
    _check_key(key)
    return workspaces_root() / key


def _is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def _new_engine(url: str, schema: str | None = None) -> Engine:
    sqlite = _is_sqlite(url)
    connect_args: dict[str, object] = {"check_same_thread": False} if sqlite else {}
    if schema:
        connect_args["options"] = f"-csearch_path={schema}"
    if schema and not sqlite:
        with create_engine(url, future=True).begin() as connection:
            connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    engine = create_engine(url, future=True, pool_pre_ping=True, connect_args=connect_args)
    if sqlite:

        @event.listens_for(engine, "connect")
        def _tune_sqlite(dbapi_connection, _record) -> None:  # type: ignore[no-untyped-def]
            """WAL lets readers and the writer work at the same time (web app, scheduler, MCP)."""
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=5000")
            cursor.close()

    return engine


def _sqlite_url(path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{path.as_posix()}"


def _url_for(key: str) -> tuple[str, str | None]:
    base = get_settings().sqlalchemy_url
    if key == DEFAULT_WORKSPACE:
        return base, None
    if key == ACCOUNTS:
        return (_sqlite_url(workspaces_root() / "accounts.sqlite3"), None) if _is_sqlite(base) else (base, "plm_accounts")
    return (_sqlite_url(workspace_dir(key) / "plm.sqlite3"), None) if _is_sqlite(base) else (base, f"ws_{key}")


def engine_for(key: str) -> Engine:
    """Engine of a workspace; its tables are created (and migrated) the first time it is used."""
    engine = _engines.get(key)
    if engine is not None:
        return engine
    with _lock:
        engine = _engines.get(key)
        if engine is None:
            _check_key(key)
            url, schema = _url_for(key)
            engine = _new_engine(url, schema)
            if key == ACCOUNTS:
                from app.models.account import AccountsBase

                AccountsBase.metadata.create_all(bind=engine)
                _add_missing_columns(AccountsBase.metadata, engine)
            else:
                _init_workspace(engine)
            _engines[key] = engine
    return engine


def current_engine() -> Engine:
    return engine_for(current_workspace())


def dispose_workspace(key: str) -> None:
    with _lock:
        engine = _engines.pop(key, None)
    if engine is not None:
        engine.dispose()


class _WorkspaceSessionFactory:
    """Drop-in for a sessionmaker: opens a session on the current request's workspace."""

    def __call__(self, **kwargs: object) -> Session:
        return _factory(bind=current_engine(), **kwargs)


SessionLocal = _WorkspaceSessionFactory()


def AccountsSession() -> Session:  # noqa: N802 - used like a sessionmaker
    return _factory(bind=engine_for(ACCOUNTS))


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _init_workspace(engine: Engine) -> None:
    # Import models so they are registered on the metadata before creating tables.
    from app import models  # noqa: F401
    from app.models.base import Base
    from app.services import activity, warehouse

    Base.metadata.create_all(bind=engine)
    _add_missing_columns(Base.metadata, engine)
    _add_missing_indexes(Base.metadata, engine)
    activity.install()
    with _factory(bind=engine) as db:
        warehouse.backfill(db)


def init_db() -> None:
    """Open the accounts store and the workspaces that exist, so they are migrated at startup."""
    from app.services import accounts

    engine_for(ACCOUNTS)
    for key in accounts.active_workspaces():
        engine_for(key)


def _add_missing_columns(metadata: MetaData, engine: Engine) -> None:
    """Lightweight migration: add columns (and their indexes) that were introduced after a table was created.

    New columns are always nullable or have a server default, so ALTER TABLE ... ADD COLUMN works on
    SQLite and PostgreSQL. Foreign keys are not added to existing tables; the app clears references itself.
    """
    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table in metadata.sorted_tables:
            if table.name not in existing:
                continue
            present = {column["name"] for column in inspector.get_columns(table.name)}
            missing = [column for column in table.columns if column.name not in present]
            for column in missing:
                ddl = CreateColumn(column).compile(dialect=engine.dialect)
                connection.execute(text(f"ALTER TABLE {table.name} ADD COLUMN {ddl}"))
            if missing:
                for index in table.indexes:
                    index.create(connection, checkfirst=True)


def _add_missing_indexes(metadata: MetaData, engine: Engine) -> None:
    """Create indexes that were added to a model after its table already existed (create_all skips those)."""
    with engine.begin() as connection:
        for table in metadata.sorted_tables:
            for index in table.indexes:
                index.create(connection, checkfirst=True)


def database_label(url: str | None = None) -> str:
    return make_url(url or get_settings().sqlalchemy_url).get_backend_name()
