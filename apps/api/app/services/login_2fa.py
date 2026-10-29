"""Second login factor: a six-digit code sent to the linked Telegram chat."""

import hashlib
import hmac
import secrets
from datetime import timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import LoginChallenge
from app.models.base import utcnow
from app.services import notifications, telegram
from app.services.app_settings import get_app_settings

CODE_LIFETIME = timedelta(minutes=5)
MAX_ATTEMPTS = 5
# At most this many codes per 10 minutes, so the bot cannot be used to spam the chat.
MAX_CHALLENGES = 5

TEXTS = {
    "de": "🔐 <b>Anmeldecode für Anamnesies</b>\n<code>{code}</code>\n\nGültig für 5 Minuten. Wenn du dich gerade nicht anmeldest, ignoriere diese Nachricht.",
    "en": "🔐 <b>Anamnesies login code</b>\n<code>{code}</code>\n\nValid for 5 minutes. If you are not signing in right now, ignore this message.",
}


class ChallengeError(Exception):
    pass


def _hash(challenge_id: str, code: str) -> str:
    return hashlib.sha256(f"{challenge_id}:{code}".encode()).hexdigest()


def is_required(db: Session) -> bool:
    row = notifications.get_telegram_settings(db)
    return bool(row.login_2fa and notifications.is_ready(row))


def create_challenge(db: Session) -> LoginChallenge:
    row = notifications.get_telegram_settings(db)
    if not (row.login_2fa and notifications.is_ready(row)):
        raise ChallengeError("Two-factor login is not enabled")
    now = utcnow()
    db.execute(delete(LoginChallenge).where(LoginChallenge.expires_at < now - timedelta(hours=1)))
    recent = db.scalar(select(func.count()).select_from(LoginChallenge).where(LoginChallenge.created_at >= now - timedelta(minutes=10))) or 0
    if recent >= MAX_CHALLENGES:
        db.commit()
        raise ChallengeError("Too many login codes requested. Try again in a few minutes.")
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge = LoginChallenge(id=secrets.token_urlsafe(24), expires_at=now + CODE_LIFETIME, created_at=now)
    challenge.code_hash = _hash(challenge.id, code)
    db.add(challenge)
    db.commit()
    language = "en" if get_app_settings(db).language == "en" else "de"
    try:
        # Sent without the message log: the code must not be stored anywhere in plain text.
        telegram.send_message(row.bot_token or "", row.chat_id or "", TEXTS[language].format(code=code))
    except telegram.TelegramError as exc:
        db.delete(challenge)
        db.commit()
        raise ChallengeError(f"Telegram error: {exc}") from exc
    notifications.log_message(db, "out", "🔐 Login code sent" if language == "en" else "🔐 Anmeldecode gesendet")
    return challenge


def verify(db: Session, challenge_id: str, code: str) -> tuple[bool, int]:
    """Returns (valid, remaining attempts). A challenge can be used once."""
    challenge = db.get(LoginChallenge, challenge_id)
    if challenge is None or challenge.used:
        return False, 0
    expires_at = challenge.expires_at if challenge.expires_at.tzinfo else challenge.expires_at.replace(tzinfo=utcnow().tzinfo)
    if expires_at < utcnow() or challenge.attempts >= MAX_ATTEMPTS:
        return False, 0
    challenge.attempts += 1
    valid = hmac.compare_digest(challenge.code_hash, _hash(challenge.id, code.strip()))
    if valid:
        challenge.used = True
    db.commit()
    return valid, max(0, MAX_ATTEMPTS - challenge.attempts)
