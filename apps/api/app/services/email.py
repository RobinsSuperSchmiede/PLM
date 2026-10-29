import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from app.models import AppSettings


class EmailNotConfiguredError(RuntimeError):
    pass


def send_email(row: AppSettings, *, to: str, subject: str, body: str) -> None:
    """Send a plain-text email through the SMTP server configured in the workspace settings."""

    if not row.smtp_host or not row.email_from_address:
        raise EmailNotConfiguredError("SMTP host and sender address must be configured in the settings.")

    sender_domain = row.email_from_address.split("@", 1)[1]
    message = EmailMessage()
    message["From"] = formataddr((row.email_from_name or "Anamnesies", row.email_from_address))
    message["To"] = to
    message["Subject"] = subject
    message["Message-ID"] = make_msgid(domain=sender_domain)
    message.set_content(body)

    context = ssl.create_default_context()
    if row.smtp_security == "ssl":
        client: smtplib.SMTP = smtplib.SMTP_SSL(row.smtp_host, row.smtp_port, timeout=15, context=context)
    else:
        client = smtplib.SMTP(row.smtp_host, row.smtp_port, timeout=15, local_hostname=row.custom_domain or None)
    with client:
        if row.smtp_security == "starttls":
            client.starttls(context=context)
        if row.smtp_username and row.smtp_password:
            client.login(row.smtp_username, row.smtp_password)
        client.send_message(message)
