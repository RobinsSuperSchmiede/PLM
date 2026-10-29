import ipaddress
import secrets
import socket

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import AppSettings
from app.schemas.app_settings import DomainCheck, SettingsRead, SettingsUpdate

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def get_app_settings(db: Session) -> AppSettings:
    row = db.get(AppSettings, 1)
    if row is None:
        row = AppSettings(id=1, mcp_token=generate_token())
        db.add(row)
        db.commit()
        db.refresh(row)
    elif not row.mcp_token:
        row.mcp_token = generate_token()
        db.commit()
    return row


def mcp_host(row: AppSettings) -> str | None:
    return row.mcp_domain or row.custom_domain


def to_read(row: AppSettings) -> SettingsRead:
    port = get_settings().api_port
    scheme = "https" if row.use_https else "http"
    local_url = f"http://localhost:{port}/mcp"
    host = mcp_host(row)
    return SettingsRead.model_validate(
        {
            **{column.name: getattr(row, column.name) for column in AppSettings.__table__.columns if column.name != "smtp_password"},
            "smtp_password_set": bool(row.smtp_password),
            "app_url": f"{scheme}://{row.custom_domain}" if row.custom_domain else None,
            "mcp_url": f"{scheme}://{host}/mcp" if host else local_url,
            "mcp_local_url": local_url,
        }
    )


def update_app_settings(db: Session, payload: SettingsUpdate) -> AppSettings:
    row = get_app_settings(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "smtp_password":
            # Keep the stored secret unless a new value (or an explicit empty string) is sent.
            if value is None:
                continue
            value = value or None
        if field in {"smtp_host", "smtp_username", "email_from_name"} and isinstance(value, str):
            value = value.strip() or None
        setattr(row, field, value)
    db.commit()
    db.refresh(row)
    return row


def rotate_token(db: Session) -> AppSettings:
    row = get_app_settings(db)
    row.mcp_token = generate_token()
    db.commit()
    db.refresh(row)
    return row


def allowed_mcp_hosts(row: AppSettings) -> set[str]:
    hosts = set(LOCAL_HOSTS)
    hosts.update(host.lower() for host in get_settings().mcp_allowed_hosts)
    for domain in (row.custom_domain, row.mcp_domain):
        if domain:
            hosts.add(domain.lower())
    return hosts


def _local_addresses() -> set[str]:
    addresses = {"127.0.0.1", "::1"}
    try:
        addresses.update(info[4][0] for info in socket.getaddrinfo(socket.gethostname(), None))
    except OSError:
        pass
    return addresses


def check_domain(domain: str) -> DomainCheck:
    try:
        addresses = sorted({str(info[4][0]) for info in socket.getaddrinfo(domain, None)})
    except OSError:
        return DomainCheck(domain=domain, resolves=False, addresses=[], points_to_local=False)
    local = _local_addresses()
    points_to_local = any(address in local or ipaddress.ip_address(address).is_loopback for address in addresses)
    return DomainCheck(domain=domain, resolves=True, addresses=addresses, points_to_local=points_to_local)
