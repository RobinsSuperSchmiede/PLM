"""One-time import of an SQLite installation into PostgreSQL (the desktop app's db service).

    python -m scripts.import_sqlite --target <postgresql url> --database <plm.sqlite3>
        [--workspaces <folder with accounts.sqlite3 and <key>/plm.sqlite3>]

Run with the API's virtual environment from apps/api (openshell_api.py does that on the first start).
Everything goes in one transaction: either all data is in PostgreSQL afterwards, or nothing is.

- the default workspace (the database file) → schema `public`
- the accounts store (accounts.sqlite3)      → schema `plm_accounts`
- further workspaces (<key>/plm.sqlite3)     → schema `ws_<key>`

Rows are read and written with the API's own models, so values keep their types (UUIDs, JSON,
booleans). Times without a zone are UTC, as the API stores them. The SQLite files are only read,
from a snapshot taken first, so a running API on them does not disturb the import.
"""

from __future__ import annotations

import argparse
import re
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import DateTime, Integer, MetaData, create_engine, inspect, select, text
from sqlalchemy.engine import Connection

# OpenShell reads the output as UTF-8; on Windows Python would write it in the system code page
# (cp1252 when started from the Start menu) and fail on characters that code page lacks.
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

BATCH = 500
WORKSPACE_KEY = re.compile(r"^[a-z0-9_]{1,40}$")


def say(text_: str) -> None:
    print(f"[import_sqlite] {text_}", flush=True)


def snapshot(source: Path, folder: Path) -> Path:
    """A consistent copy of an SQLite database (includes what is still in its WAL file)."""
    target = folder / f"{len(list(folder.iterdir()))}-{source.name}"
    with sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True) as reader, sqlite3.connect(target) as writer:
        reader.backup(writer)
    return target


def as_utc(value: object) -> object:
    if isinstance(value, datetime) and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def copy_schema(connection: Connection, source: Path, metadata: MetaData, schema: str) -> dict[str, int]:
    """Creates the tables of `metadata` in `schema` and copies the rows of `source` into them."""
    connection.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
    connection.execute(text(f'SET LOCAL search_path TO "{schema}"'))
    metadata.create_all(connection)
    for table in metadata.sorted_tables:
        if connection.execute(select(table).limit(1)).first() is not None:
            raise SystemExit(f"Schema {schema} already holds data in {table.name}; nothing was imported.")

    reader = create_engine(f"sqlite:///{source.as_posix()}")
    present = set(inspect(reader).get_table_names())
    counts: dict[str, int] = {}
    with reader.connect() as source_connection:
        for table in metadata.sorted_tables:
            if table.name not in present:
                continue
            columns = {column["name"] for column in inspect(reader).get_columns(table.name)}
            selected = [column for column in table.columns if column.name in columns]
            zoned = {column.name for column in selected if isinstance(column.type, DateTime)}
            rows = source_connection.execute(select(*selected)).mappings()
            batch: list[dict[str, object]] = []
            total = 0
            for row in rows:
                batch.append({key: as_utc(value) if key in zoned else value for key, value in row.items()})
                if len(batch) >= BATCH:
                    connection.execute(table.insert(), batch)
                    total += len(batch)
                    batch = []
            if batch:
                connection.execute(table.insert(), batch)
                total += len(batch)
            counts[table.name] = total
            # Integer keys: the sequence continues after the imported rows.
            keys = list(table.primary_key.columns)
            if len(keys) == 1 and isinstance(keys[0].type, Integer) and total:
                connection.execute(
                    text(
                        "SELECT setval(seq, (SELECT max({column}) FROM {table})) "
                        "FROM pg_get_serial_sequence(:table, :column) AS seq WHERE seq IS NOT NULL".format(
                            column=f'"{keys[0].name}"', table=f'"{table.name}"'
                        )
                    ),
                    {"table": f'"{schema}"."{table.name}"', "column": keys[0].name},
                )
    reader.dispose()
    skipped = sorted(present - {table.name for table in metadata.sorted_tables})
    if skipped:
        say(f"{schema}: tables the API no longer knows, not imported: {', '.join(skipped)}")
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--target", required=True, help="SQLAlchemy URL of the PostgreSQL database")
    parser.add_argument("--database", required=True, type=Path, help="SQLite file of the default workspace")
    parser.add_argument("--workspaces", type=Path, help="WORKSPACES_DIR of the SQLite installation")
    args = parser.parse_args()

    from app import models  # noqa: F401 - registers every table on the metadata
    from app.models.account import AccountsBase
    from app.models.base import Base

    sources: list[tuple[Path, MetaData, str]] = [(args.database, Base.metadata, "public")]
    if args.workspaces and args.workspaces.is_dir():
        accounts = args.workspaces / "accounts.sqlite3"
        if accounts.is_file():
            sources.append((accounts, AccountsBase.metadata, "plm_accounts"))
        for folder in sorted(args.workspaces.iterdir()):
            if folder.is_dir() and WORKSPACE_KEY.match(folder.name) and (folder / "plm.sqlite3").is_file():
                sources.append((folder / "plm.sqlite3", Base.metadata, f"ws_{folder.name}"))

    engine = create_engine(args.target)
    with tempfile.TemporaryDirectory(prefix="plm-import-") as temporary:
        copies = [(snapshot(path, Path(temporary)), metadata, schema, path) for path, metadata, schema in sources]
        with engine.begin() as connection:
            # Rows go in table by table; references between them (also within a table) are checked
            # by SQLite's rules, i.e. not at all, so PostgreSQL's foreign key triggers wait.
            connection.execute(text("SET LOCAL session_replication_role = replica"))
            for copy, metadata, schema, original in copies:
                counts = copy_schema(connection, copy, metadata, schema)
                say(f"{original} -> {schema}: {sum(counts.values())} rows in {len(counts)} tables")
    engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(main())
