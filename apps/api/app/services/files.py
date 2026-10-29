"""Storage for uploaded files. Only images, PDFs and Office documents are accepted."""

import uuid
from pathlib import Path
from typing import BinaryIO

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import StoredFile

API_ROOT = Path(__file__).resolve().parents[2]

# Extension -> (kind, content type). Anything else is rejected, so no HTML/SVG/scripts are ever served.
ALLOWED: dict[str, tuple[str, str]] = {
    ".png": ("image", "image/png"),
    ".jpg": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".gif": ("image", "image/gif"),
    ".webp": ("image", "image/webp"),
    ".pdf": ("pdf", "application/pdf"),
    ".doc": ("document", "application/msword"),
    ".docx": ("document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".xls": ("spreadsheet", "application/vnd.ms-excel"),
    ".xlsx": ("spreadsheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ".ppt": ("presentation", "application/vnd.ms-powerpoint"),
    ".pptx": ("presentation", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
}

INLINE_KINDS = {"image", "pdf"}


class UploadRejectedError(ValueError):
    pass


def upload_dir() -> Path:
    path = Path(get_settings().upload_dir)
    path = path if path.is_absolute() else API_ROOT / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def path_of(stored: StoredFile) -> Path:
    return upload_dir() / stored.storage_key


def save(db: Session, name: str, stream: BinaryIO, *, project_id: uuid.UUID | None = None, description: str | None = None) -> StoredFile:
    extension = Path(name).suffix.lower()
    if extension not in ALLOWED:
        raise UploadRejectedError(f"File type {extension or '(none)'} is not supported. Allowed: {', '.join(sorted(ALLOWED))}")
    kind, content_type = ALLOWED[extension]
    limit = get_settings().max_upload_mb * 1024 * 1024
    key = f"{uuid.uuid4().hex}{extension}"
    target = upload_dir() / key
    size = 0
    try:
        with target.open("wb") as output:
            while chunk := stream.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise UploadRejectedError(f"File is larger than {get_settings().max_upload_mb} MB")
                output.write(chunk)
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    stored = StoredFile(name=Path(name).name[:255] or key, content_type=content_type, size=size, kind=kind, storage_key=key,
                        project_id=project_id, description=description)
    db.add(stored)
    db.commit()
    db.refresh(stored)
    return stored


def remove_content(stored: StoredFile) -> None:
    path_of(stored).unlink(missing_ok=True)
