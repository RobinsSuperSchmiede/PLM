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
    for thumbnail in (upload_dir() / THUMBNAIL_DIR).glob(f"{Path(stored.storage_key).stem}-*.webp"):
        thumbnail.unlink(missing_ok=True)


# --- Thumbnails ---------------------------------------------------------------------------------

THUMBNAIL_DIR = ".thumbs"
# Longest edge in pixels; requests are rounded up to one of these so only a few variants are stored.
THUMBNAIL_SIZES = (160, 320, 640, 1280)


def thumbnail_size(requested: int) -> int:
    return next((size for size in THUMBNAIL_SIZES if size >= requested), THUMBNAIL_SIZES[-1])


def thumbnail_path(stored: StoredFile, requested: int) -> Path | None:
    """Path of a small WebP preview of an image, created on first use. None if no preview can be made."""
    if stored.kind != "image":
        return None
    source = path_of(stored)
    if not source.exists():
        return None
    directory = upload_dir() / THUMBNAIL_DIR
    target = directory / f"{Path(stored.storage_key).stem}-{thumbnail_size(requested)}.webp"
    if target.exists():
        return target

    from PIL import Image, ImageOps, UnidentifiedImageError

    size = thumbnail_size(requested)
    try:
        with Image.open(source) as image:
            image.seek(0)  # first frame of animated GIF/WebP
            image = ImageOps.exif_transpose(image)
            if image.mode not in ("RGB", "RGBA"):
                image = image.convert("RGBA" if "A" in image.getbands() or "transparency" in image.info else "RGB")
            image.thumbnail((size, size), Image.Resampling.LANCZOS)
            directory.mkdir(parents=True, exist_ok=True)
            # Written to a temporary name first so a parallel request never serves a half-written file.
            temporary = target.with_name(f"{target.stem}.{uuid.uuid4().hex}.tmp")
            image.save(temporary, "WEBP", quality=80, method=4)
            temporary.replace(target)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        return None
    return target
