from collections.abc import Iterator

from sqlalchemy import MetaData, create_engine, inspect, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import CreateColumn

from app.core.config import get_settings

settings = get_settings()
connect_args = {"check_same_thread": False} if settings.sqlalchemy_url.startswith("sqlite") else {}
engine = create_engine(settings.sqlalchemy_url, future=True, pool_pre_ping=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import models so they are registered on the metadata before creating tables.
    from app import models  # noqa: F401
    from app.models.base import Base
    from app.services import activity

    Base.metadata.create_all(bind=engine)
    _add_missing_columns(Base.metadata)
    activity.install()


def _add_missing_columns(metadata: MetaData) -> None:
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
