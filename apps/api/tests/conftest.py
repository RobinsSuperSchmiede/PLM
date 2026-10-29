import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

import pytest

_db_dir = tempfile.mkdtemp(prefix="plm-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_db_dir) / 'test.sqlite3'}"
os.environ["SCHEDULER_ENABLED"] = "false"
os.environ["UPLOAD_DIR"] = str(Path(_db_dir) / "uploads")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> Iterator[TestClient]:
    with TestClient(app, base_url="http://localhost") as test_client:
        yield test_client
