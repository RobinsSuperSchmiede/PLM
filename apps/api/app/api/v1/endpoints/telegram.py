from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import TelegramMessageLog
from app.schemas.notification import TelegramMessage, TelegramRead, TelegramUpdate
from app.schemas.organization import TelegramLogRead
from app.services import notifications as service
from app.services.telegram import TelegramError, TelegramNotConfiguredError

router = APIRouter(prefix="/telegram")


def deliver(db: Session, text: str) -> None:
    try:
        service.sender(service.get_telegram_settings(db), db)(text)
    except TelegramNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except TelegramError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Telegram error: {exc}") from exc


@router.get("", response_model=TelegramRead)
def read_telegram(db: Session = Depends(get_db)) -> TelegramRead:
    return service.to_read(service.get_telegram_settings(db))


@router.patch("", response_model=TelegramRead)
def update_telegram(payload: TelegramUpdate, db: Session = Depends(get_db)) -> TelegramRead:
    try:
        return service.to_read(service.update_telegram_settings(db, payload))
    except TelegramNotConfiguredError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except TelegramError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Bot token rejected: {exc}") from exc


@router.post("/unlink", response_model=TelegramRead)
def unlink_telegram(db: Session = Depends(get_db)) -> TelegramRead:
    return service.to_read(service.unlink(db))


@router.post("/test")
def send_test_message(db: Session = Depends(get_db)) -> dict[str, str]:
    deliver(db, service.texts(db)["test"])
    return {"status": "sent"}


@router.post("/digest")
def send_digest_now(db: Session = Depends(get_db)) -> dict[str, str]:
    row = service.get_telegram_settings(db)
    deliver(db, service.build_digest(db, service.local_now(row).date()))
    return {"status": "sent"}


@router.post("/message")
def send_message(payload: TelegramMessage, db: Session = Depends(get_db)) -> dict[str, str]:
    deliver(db, payload.text)
    return {"status": "sent"}


@router.get("/messages", response_model=list[TelegramLogRead])
def list_messages(project_id: str | None = None, limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db)) -> list[TelegramMessageLog]:
    statement = select(TelegramMessageLog).order_by(TelegramMessageLog.at.desc(), TelegramMessageLog.id.desc()).limit(limit)
    if project_id:
        statement = statement.where(TelegramMessageLog.project_id == project_id)
    return list(db.scalars(statement).all())
