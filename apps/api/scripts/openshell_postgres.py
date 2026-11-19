"""PostgreSQL for the desktop app: the OpenShell service `db` (see openshell.json).

    python scripts/openshell_postgres.py      runs PostgreSQL on 127.0.0.1:$PORT until stopped

Data: a cluster of its own in OPENSHELL_DATA_DIR/postgres/cluster. The first start creates it with
the user `plm`, the database `plm` and a random password in OPENSHELL_DATA_DIR/postgres/password
(only this user may read it); openshell_api.py hands it to the API (`database_url`).

Binaries: a PostgreSQL 18 of the system (PG_BIN, PATH or the usual install folders). Without one,
the PostgreSQL build of the zonky project is downloaded from Maven Central into
OPENSHELL_DATA_DIR/runtimes and checked against the SHA-256 pinned below.
"""

from __future__ import annotations

import glob
import hashlib
import io
import os
import platform
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

# OpenShell reads the output as UTF-8; on Windows Python would write it in the system code page
# (cp1252 when started from the Start menu) and fail on characters that code page lacks.
for _stream in (sys.stdout, sys.stderr):
    _stream.reconfigure(encoding="utf-8", errors="replace")

API_DIR = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("OPENSHELL_DATA_DIR") or API_DIR / "data").resolve()
ROOT = DATA / "postgres"
CLUSTER = ROOT / "cluster"
PASSWORD = ROOT / "password"
USER = "plm"
DATABASE = "plm"

MAJOR = 18
# Maven Central: io.zonky.test.postgres:embedded-postgres-binaries-<platform>:<VERSION> (SHA-256 of the jar).
VERSION = "18.7.0"
DOWNLOADS = {
    ("Windows", "AMD64"): ("windows-amd64", "789d0261833f6c1fc9ea9e0a882ba5ef5d49366144516a44ed6fd7461d08c3f8"),
    ("Darwin", "arm64"): ("darwin-arm64v8", "42b3812af4fd991ba3b06378590069b082a5912c77ee35b54b25800fcfc52af1"),
    ("Darwin", "x86_64"): ("darwin-amd64", "b30057b89dcf6d9c45b22d1f9acddd1a0c8999193d00e7fad8058b6863c6620b"),
    ("Linux", "x86_64"): ("linux-amd64", "10a1954a80519c634b59a9c452c3a4c5ea24c409fa0a65ba28b76f36157edecc"),
    ("Linux", "aarch64"): ("linux-arm64v8", "762b7e43792918748e1e19c027f3ea2b294e8574c58a110faeef0e239affac0f"),
}
EXE = ".exe" if os.name == "nt" else ""


def say(text: str) -> None:
    print(f"[openshell_postgres] {text}", flush=True)


def database_url(port: str | int) -> str:
    """SQLAlchemy URL of the database this service runs (for the API)."""
    password = PASSWORD.read_text(encoding="utf-8").strip()
    return f"postgresql+psycopg://{USER}:{password}@127.0.0.1:{port}/{DATABASE}"


# ---- Binaries -----------------------------------------------------------------------------------


def major_of(bin_dir: Path) -> int | None:
    try:
        output = subprocess.run([str(bin_dir / f"postgres{EXE}"), "--version"], capture_output=True, text=True, timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return None
    found = re.search(r"(\d+)(?:\.\d+)?", output)
    return int(found.group(1)) if found else None


def system_bin_dirs() -> list[Path]:
    candidates = [os.environ.get("PG_BIN", "")]
    for tool in ("postgres", "pg_ctl"):
        found = shutil.which(tool)
        if found:
            candidates.append(str(Path(found).parent))
    patterns = {
        "nt": [r"C:\Program Files\PostgreSQL\*\bin"],
        "posix": [
            "/usr/lib/postgresql/*/bin",
            "/usr/pgsql-*/bin",
            "/opt/homebrew/opt/postgresql@*/bin",
            "/usr/local/opt/postgresql@*/bin",
            "/Applications/Postgres.app/Contents/Versions/*/bin",
        ],
    }[os.name]
    for pattern in patterns:
        candidates.extend(sorted(glob.glob(pattern), reverse=True))
    return [Path(folder) for folder in candidates if folder and (Path(folder) / f"initdb{EXE}").is_file()]


def download() -> Path:
    target = DATA / "runtimes" / f"postgresql-{VERSION}"
    if (target / "bin" / f"postgres{EXE}").is_file():
        return target / "bin"
    key = (platform.system(), platform.machine())
    if key not in DOWNLOADS:
        sys.exit(f"No PostgreSQL download for {key[0]}/{key[1]}. Install PostgreSQL {MAJOR} or set PG_BIN.")
    name, expected = DOWNLOADS[key]
    url = (
        "https://repo1.maven.org/maven2/io/zonky/test/postgres/"
        f"embedded-postgres-binaries-{name}/{VERSION}/embedded-postgres-binaries-{name}-{VERSION}.jar"
    )
    say(f"no PostgreSQL {MAJOR} found on this system; downloading {url}")
    with urllib.request.urlopen(url, timeout=600) as response:
        jar = response.read()
    if hashlib.sha256(jar).hexdigest() != expected:
        sys.exit("The PostgreSQL download does not match its pinned checksum and was discarded.")
    staging = target.with_name(target.name + ".unpacking")
    shutil.rmtree(staging, ignore_errors=True)
    with zipfile.ZipFile(io.BytesIO(jar)) as archive:
        inner = next(entry for entry in archive.namelist() if entry.endswith(".txz"))
        with tarfile.open(fileobj=io.BytesIO(archive.read(inner)), mode="r:xz") as tar:
            if hasattr(tarfile, "data_filter"):
                tar.extractall(staging, filter="data")
            else:  # Python before 3.11.4: refuse entries that would leave the folder
                for member in tar.getmembers():
                    if member.name.startswith(("/", "\\")) or ".." in Path(member.name).parts:
                        sys.exit(f"Unsafe path in the PostgreSQL download: {member.name}")
                tar.extractall(staging)
    shutil.rmtree(target, ignore_errors=True)
    staging.rename(target)
    return target / "bin"


def binaries() -> Path:
    for folder in system_bin_dirs():
        if major_of(folder) == MAJOR:
            return folder
    return download()


# ---- Cluster ------------------------------------------------------------------------------------


def create_cluster(bin_dir: Path) -> None:
    say(f"creating the database cluster in {CLUSTER}")
    # English messages: the tools would otherwise print in the system language and code page.
    english = {**os.environ, "LC_ALL": "C", "LANG": "C", "LC_MESSAGES": "C"}
    ROOT.mkdir(parents=True, exist_ok=True)
    PASSWORD.write_text(secrets.token_urlsafe(24), encoding="utf-8")
    if os.name != "nt":
        PASSWORD.chmod(0o600)
    staging = CLUSTER.with_name("cluster.creating")
    shutil.rmtree(staging, ignore_errors=True)
    subprocess.run(
        [str(bin_dir / f"initdb{EXE}"), "-D", str(staging), "-U", USER, f"--pwfile={PASSWORD}",
         "-A", "scram-sha-256", "-E", "UTF8", "--no-locale"],
        check=True,
        env=english,
    )
    # The database the API uses, created in single-user mode (no server, no client tools needed).
    subprocess.run(
        [str(bin_dir / f"postgres{EXE}"), "--single", "-D", str(staging), "postgres"],
        input=f"CREATE DATABASE {DATABASE};\n", text=True, check=True, stdout=subprocess.DEVNULL, env=english,
    )
    staging.rename(CLUSTER)


def clear_stale_lock() -> None:
    """After a hard stop the lock file stays. It is removed unless a server still answers on its port."""
    lock = CLUSTER / "postmaster.pid"
    if not lock.is_file():
        return
    lines = lock.read_text(encoding="utf-8", errors="replace").splitlines()
    port = int(lines[3]) if len(lines) > 3 and lines[3].strip().isdigit() else None
    if port:
        try:
            socket.create_connection(("127.0.0.1", port), timeout=1).close()
            sys.exit(f"PostgreSQL still runs on this data (port {port}). Stop it first.")
        except OSError:
            pass
    lock.unlink()


def main() -> int:
    port = os.environ.get("PORT", "5432")
    bin_dir = binaries()
    say(f"PostgreSQL: {bin_dir}")
    try:
        if not (CLUSTER / "PG_VERSION").is_file():
            create_cluster(bin_dir)
    except subprocess.CalledProcessError as error:
        say(f"creating the cluster failed ({error.returncode})")
        return 1
    clear_stale_lock()
    command = [
        str(bin_dir / f"postgres{EXE}"), "-D", str(CLUSTER), "-p", port,
        "-c", "listen_addresses=127.0.0.1", "-c", "unix_socket_directories=",
    ]
    try:
        # PostgreSQL logs everything to stderr; the lines carry their level (LOG, ERROR, FATAL).
        return subprocess.call(command, stderr=subprocess.STDOUT)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
