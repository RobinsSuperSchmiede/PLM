import uuid

from fastapi import APIRouter, status

from app.schemas.note import NoteCreate, NoteRead

router = APIRouter()
_notes: list[dict[str, object]] = []


@router.get("/notes", response_model=list[NoteRead])
def list_notes() -> list[NoteRead]:
    return [
        NoteRead(
            id=str(note["id"]),
            title=str(note["title"]),
            content=note.get("content"),
        )
        for note in _notes
    ]


@router.post("/notes", response_model=NoteRead, status_code=status.HTTP_201_CREATED)
def create_note(note: NoteCreate) -> NoteRead:
    payload = {
        "id": uuid.uuid4(),
        "title": note.title,
        "content": note.content,
    }
    _notes.append(payload)
    return NoteRead(
        id=str(payload["id"]),
        title=str(payload["title"]),
        content=payload.get("content"),
    )
