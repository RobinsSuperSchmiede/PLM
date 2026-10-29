import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import StoredFile
from app.schemas.organization import EntityType, FileRead, FileUpdate
from app.services import crud, files
from app.services import organization as org

router = APIRouter(prefix="/files", tags=["files"])


def load(db: Session, file_id: uuid.UUID) -> StoredFile:
    stored = db.get(StoredFile, file_id)
    if stored is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    return stored


@router.get("", response_model=list[FileRead])
def list_files(kind: str | None = None, db: Session = Depends(get_db)) -> list[StoredFile]:
    statement = select(StoredFile).where(StoredFile.archived_at.is_(None)).order_by(StoredFile.created_at.desc())
    if kind:
        statement = statement.where(StoredFile.kind == kind)
    return list(db.scalars(statement).all())


@router.post("", response_model=FileRead, status_code=status.HTTP_201_CREATED)
def upload_file(
    file: UploadFile = File(...),
    project_id: uuid.UUID | None = Form(None),
    description: str | None = Form(None),
    attach_type: EntityType | None = Form(None),
    attach_id: uuid.UUID | None = Form(None),
    db: Session = Depends(get_db),
) -> StoredFile:
    """Upload a file; with attach_type/attach_id it is linked to that note, task, project, ..."""
    try:
        if attach_type and attach_id:
            org.load(db, attach_type, attach_id)
        stored = files.save(db, file.filename or "upload", file.file, project_id=project_id, description=description)
    except files.UploadRejectedError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except org.UnknownEntityError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if attach_type and attach_id:
        org.create_link(db, attach_type, attach_id, "file", stored.id)
    return stored


@router.get("/{file_id}", response_model=FileRead)
def get_file(file_id: uuid.UUID, db: Session = Depends(get_db)) -> StoredFile:
    return load(db, file_id)


@router.get("/{file_id}/content")
def file_content(file_id: uuid.UUID, download: bool = False, db: Session = Depends(get_db)) -> FileResponse:
    stored = load(db, file_id)
    path = files.path_of(stored)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File content missing")
    disposition = "inline" if stored.kind in files.INLINE_KINDS and not download else "attachment"
    return FileResponse(
        path,
        media_type=stored.content_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(stored.name)}",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, max-age=86400",
        },
    )


@router.patch("/{file_id}", response_model=FileRead)
def update_file(file_id: uuid.UUID, payload: FileUpdate, db: Session = Depends(get_db)) -> StoredFile:
    return crud.update_entity(db, load(db, file_id), payload)


@router.delete("/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(file_id: uuid.UUID, db: Session = Depends(get_db)) -> Response:
    crud.delete_entity(db, load(db, file_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
