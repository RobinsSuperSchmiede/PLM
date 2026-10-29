import smtplib

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.schemas.app_settings import DomainCheckResult, SettingsRead, SettingsUpdate, TestEmailRequest
from app.services import app_settings as service
from app.services.email import EmailNotConfiguredError, send_email

router = APIRouter(prefix="/settings")


@router.get("", response_model=SettingsRead)
def read_settings(db: Session = Depends(get_db)) -> SettingsRead:
    return service.to_read(service.get_app_settings(db))


@router.patch("", response_model=SettingsRead)
def update_settings(payload: SettingsUpdate, db: Session = Depends(get_db)) -> SettingsRead:
    return service.to_read(service.update_app_settings(db, payload))


@router.post("/mcp-token", response_model=SettingsRead)
def rotate_mcp_token(db: Session = Depends(get_db)) -> SettingsRead:
    return service.to_read(service.rotate_token(db))


@router.get("/domain-check", response_model=DomainCheckResult)
def domain_check(db: Session = Depends(get_db)) -> DomainCheckResult:
    row = service.get_app_settings(db)
    domains = [domain for domain in dict.fromkeys([row.custom_domain, row.mcp_domain]) if domain]
    if row.email_from_address:
        email_domain = row.email_from_address.split("@", 1)[1].lower()
        if email_domain not in domains:
            domains.append(email_domain)
    return DomainCheckResult(checks=[service.check_domain(domain) for domain in domains])


@router.post("/test-email")
def test_email(payload: TestEmailRequest, db: Session = Depends(get_db)) -> dict[str, str]:
    row = service.get_app_settings(db)
    try:
        send_email(
            row,
            to=payload.to,
            subject="Anamnesies test email",
            body="This is a test email from your Anamnesies workspace. Your SMTP settings work.",
        )
    except EmailNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except (smtplib.SMTPException, OSError) as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"SMTP error: {exc}") from exc
    return {"status": "sent"}
