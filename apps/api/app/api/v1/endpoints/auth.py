"""Second login factor. Called by the web app's server (the browser proxy blocks /auth)."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services import login_2fa

router = APIRouter(prefix="/auth", tags=["auth"])


class ChallengeRead(BaseModel):
    challenge_id: str
    expires_at: datetime


class VerifyRequest(BaseModel):
    challenge_id: str = Field(..., min_length=10, max_length=64)
    code: str = Field(..., pattern=r"^\d{6}$")


@router.get("/second-factor")
def second_factor(db: Session = Depends(get_db)) -> dict[str, object]:
    required = login_2fa.is_required(db)
    return {"required": required, "method": "telegram" if required else None}


@router.post("/challenge", response_model=ChallengeRead)
def create_challenge(db: Session = Depends(get_db)) -> ChallengeRead:
    try:
        challenge = login_2fa.create_challenge(db)
    except login_2fa.ChallengeError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS if "Too many" in str(exc) else status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc
    return ChallengeRead(challenge_id=challenge.id, expires_at=challenge.expires_at)


@router.post("/verify")
def verify(payload: VerifyRequest, db: Session = Depends(get_db)) -> dict[str, object]:
    valid, remaining = login_2fa.verify(db, payload.challenge_id, payload.code)
    return {"valid": valid, "remaining": remaining}
