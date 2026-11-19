"""Runs the API under OpenShell (see `openshell.json` in the repository root).

    python scripts/openshell_api.py --setup   creates apps/api/.venv and installs the API's packages
    python scripts/openshell_api.py           the same if pyproject.toml changed, then uvicorn on $PORT

It is started by whatever Python the system has (3.11 or newer); the API itself runs in the virtual
environment, the same on Windows, macOS and Linux.

Data: the API uses the PostgreSQL of the OpenShell service `db` (PLM_POSTGRES_PORT, see
openshell_postgres.py); its first start imports the SQLite data that apps/api/.env points to
(import_sqlite.py). Without the service, apps/api/.env or else SQLite in the data folder is used.
A DATABASE_URL in the environment always wins. Uploads and workspaces go to OPENSHELL_DATA_DIR,
apart from the source code (per user for the desktop app, `.openshell/data` for `openshell dev`).
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import venv
from datetime import datetime, timezone
from pathlib import Path

# OpenShell reads the output as UTF-8; on Windows Python would write it in the system code page
# (cp1252 when started from the Start menu) and fail on characters that code page lacks.
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

API_DIR = Path(__file__).resolve().parents[1]
VENV = API_DIR / ".venv"
PYTHON = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
# Hash of the pyproject.toml the packages were installed from; `openshell.json` checks for this file.
MARKER = VENV / ".openshell-packages"


def say(text: str) -> None:
    print(f"[openshell_api] {text}", flush=True)


def ensure_packages() -> None:
    if sys.version_info < (3, 11):
        sys.exit(f"Python 3.11 or newer is needed; {sys.executable} is {sys.version.split()[0]}.")
    if not PYTHON.is_file():
        say(f"creating the virtual environment {VENV}")
        venv.create(VENV, with_pip=True)
    wanted = hashlib.sha256((API_DIR / "pyproject.toml").read_bytes()).hexdigest()
    if MARKER.is_file() and MARKER.read_text().strip() == wanted:
        return
    say("installing the API's packages")
    subprocess.run(
        [str(PYTHON), "-m", "pip", "install", "--disable-pip-version-check", "-e", "."],
        cwd=API_DIR,
        check=True,
    )
    MARKER.write_text(wanted)


def dotenv() -> dict[str, str]:
    """KEY=VALUE lines of apps/api/.env (the API reads the same file through pydantic-settings)."""
    values: dict[str, str] = {}
    path = API_DIR / ".env"
    if path.is_file():
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            key, sep, value = line.strip().partition("=")
            if sep and key and not key.startswith("#"):
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def local_path(value: str | None, default: str) -> Path:
    """A path setting of the API: relative paths count from apps/api, as in app/core/config.py."""
    path = Path(value or default)
    return path if path.is_absolute() else API_DIR / path


def import_existing_data(env: dict[str, str], data: Path) -> None:
    """First start on PostgreSQL: takes over the data of this checkout's SQLite installation.

    The source is what apps/api/.env configures (DATABASE_URL with sqlite, UPLOAD_DIR, WORKSPACES_DIR).
    It runs once per data folder; the SQLite files and uploads stay where they are, unchanged.
    """
    marker = data / "postgres" / "imported.json"
    if marker.is_file():
        return
    settings = dotenv()
    url = settings.get("DATABASE_URL", "")
    source = None
    if url.startswith("sqlite:///"):
        source = local_path(url.removeprefix("sqlite:///"), "plm.sqlite3")
    record: dict[str, object] = {"source": None}
    if source and source.is_file():
        uploads = local_path(settings.get("UPLOAD_DIR"), "data/uploads")
        workspaces = local_path(settings.get("WORKSPACES_DIR"), "data/workspaces")
        say(f"importing the existing data from {source}")
        subprocess.run(
            [str(PYTHON), "-m", "scripts.import_sqlite", "--target", env["DATABASE_URL"],
             "--database", str(source), "--workspaces", str(workspaces)],
            cwd=API_DIR, env=env, check=True,
        )
        if uploads.is_dir():
            shutil.copytree(uploads, env["UPLOAD_DIR"], dirs_exist_ok=True)
        if workspaces.is_dir():
            # Uploads of further workspaces; their databases are in PostgreSQL now.
            shutil.copytree(workspaces, env["WORKSPACES_DIR"], dirs_exist_ok=True,
                            ignore=shutil.ignore_patterns("*.sqlite3", "*.sqlite3-*"))
        say(f"import finished; {source} stays as it is (a backup, no longer used by the desktop app)")
        record = {"source": str(source), "uploads": str(uploads), "workspaces": str(workspaces)}
    record["at"] = datetime.now(timezone.utc).isoformat()
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text(json.dumps(record, indent=2), encoding="utf-8")


def environment() -> dict[str, str]:
    env = dict(os.environ)
    postgres_port = env.get("PLM_POSTGRES_PORT")
    if "DATABASE_URL" in env or (not postgres_port and (API_DIR / ".env").is_file()):
        say("database: as configured (DATABASE_URL or apps/api/.env)")
        return env
    data = Path(env.get("OPENSHELL_DATA_DIR") or API_DIR / "data").resolve()
    data.mkdir(parents=True, exist_ok=True)
    env.setdefault("UPLOAD_DIR", str(data / "uploads"))
    env.setdefault("WORKSPACES_DIR", str(data / "workspaces"))
    if postgres_port:
        # The OpenShell service `db` (openshell_postgres.py, next to this script). It takes precedence
        # over a DATABASE_URL in apps/api/.env, whose SQLite data it imports on the first start.
        from openshell_postgres import database_url

        env["DATABASE_URL"] = database_url(postgres_port)
        say(f"database: PostgreSQL of the db service on port {postgres_port}")
        import_existing_data(env, data)
    else:
        env["DATABASE_URL"] = f"sqlite:///{(data / 'plm.sqlite3').as_posix()}"
        say("database: SQLite in the data folder")
    say(f"data folder: {data}")
    return env


def main() -> int:
    # Python programs started from here (pip, the import, uvicorn) write UTF-8 as well.
    os.environ.setdefault("PYTHONIOENCODING", "utf-8")
    try:
        ensure_packages()
    except subprocess.CalledProcessError as error:
        say(f"installing the packages failed ({error.returncode})")
        return 1
    if "--setup" in sys.argv[1:]:
        return 0
    port = os.environ.get("PORT", "8000")
    command = [str(PYTHON), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", port]
    if os.name == "nt":
        # uvicorn's default on Windows, the proactor loop, logs a ConnectionResetError traceback each
        # time a client drops its connection – as OpenShell's health check does every few seconds.
        # The API starts no subprocesses, so the selector loop serves it as well, without the noise.
        command += ["--loop", "asyncio:SelectorEventLoop"]
    try:
        env = environment()
    except subprocess.CalledProcessError as error:
        say(f"importing the existing data failed ({error.returncode}); PostgreSQL was left unchanged")
        return 1
    try:
        return subprocess.call(command, cwd=API_DIR, env=env)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
