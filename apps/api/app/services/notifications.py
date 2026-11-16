"""Reminders, daily digest, event reminders and the Telegram bot commands."""

import calendar
import logging
import re
import secrets
from collections.abc import Callable
from datetime import date, datetime, time, timedelta
from html import escape
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Event, Meeting, Note, NotificationLog, Project, Reminder, Task, TelegramMessageLog, TelegramSettings
from app.models.base import utcnow
from app.schemas.notification import TelegramRead, TelegramUpdate
from app.services import activity, organization, telegram
from app.services.registry import type_of
from app.services.app_settings import get_app_settings

logger = logging.getLogger(__name__)

Send = Callable[[str], None]

TEXTS: dict[str, dict[str, str]] = {
    "de": {
        "reminder": "⏰ <b>Erinnerung</b>\n{text}",
        "event_soon": "📅 <b>{title}</b> beginnt um {time}{location}",
        "digest_title": "☀️ <b>Dein Tag – {date}</b>",
        "digest_tasks": "<b>Aufgaben</b>",
        "digest_overdue": "überfällig",
        "digest_agenda": "<b>Termine</b>",
        "digest_reminders": "<b>Erinnerungen</b>",
        "digest_empty": "Heute steht nichts an. 🎉",
        "linked": "✅ Verbunden! Ab jetzt bekommst du hier Erinnerungen und Benachrichtigungen von Anamnesies.\n\n{help}",
        "bad_code": "Dieser Verbindungscode ist ungültig. Öffne den Link aus den Anamnesies-Einstellungen erneut.",
        "help": (
            "<b>Befehle</b>\n"
            "/heute – Überblick für heute\n"
            "/aufgaben – offene Aufgaben\n"
            "/aufgabe &lt;Titel&gt; – neue Aufgabe\n"
            "/erinnerung &lt;wann&gt; &lt;Text&gt; – z. B. <code>/erinnerung 18:00 Müll rausbringen</code>, "
            "<code>/erinnerung in 30m Tee</code>, <code>/erinnerung morgen 9:00 Arzt anrufen</code>, "
            "<code>/erinnerung 24.12. 10:00 Geschenke</code>\n"
            "/erinnerungen – anstehende Erinnerungen\n"
            "/notiz &lt;Text&gt; – neue Notiz (erste Zeile = Titel)\n"
            "/termin &lt;wann&gt; &lt;Titel&gt; – z. B. <code>/termin morgen 14:00 Zahnarzt</code>\n"
            "/projekt &lt;Name&gt; – neues Projekt\n\n"
            "Text ohne Befehl wird als Notiz gespeichert. <code>#tag</code> vergibt Tags, "
            "<code>@Projekt</code> ordnet einem Projekt zu."
        ),
        "task_created": "✅ Aufgabe angelegt: <b>{title}</b>",
        "note_created": "📝 Notiz gespeichert: <b>{title}</b>",
        "reminder_created": "⏰ Ich erinnere dich am {when}: {text}",
        "reminder_usage": "So geht's: <code>/erinnerung 18:00 Text</code>, <code>/erinnerung in 2h Text</code> oder <code>/erinnerung morgen 9:00 Text</code>",
        "missing_text": "Bitte gib einen Text an, z. B. <code>/{command} Steuererklärung</code>",
        "no_tasks": "Keine offenen Aufgaben. 🎉",
        "open_tasks": "<b>Offene Aufgaben</b>",
        "no_reminders": "Keine anstehenden Erinnerungen.",
        "upcoming_reminders": "<b>Anstehende Erinnerungen</b>",
        "unknown": "Das habe ich nicht verstanden. /hilfe zeigt alle Befehle.",
        "test": "👋 Testnachricht von Anamnesies – Telegram ist eingerichtet.",
        "commands_disabled": "Befehle sind in den Einstellungen deaktiviert.",
        "event_created": "📅 Termin angelegt: <b>{title}</b> am {when}",
        "event_usage": "So geht's: <code>/termin morgen 14:00 Zahnarzt</code> oder <code>/termin 24.12. 18:00 Bescherung</code>",
        "project_created": "📁 Projekt angelegt: <b>{title}</b>",
        "in_project": " · Projekt <b>{project}</b>",
        "with_tags": " · {tags}",
    },
    "en": {
        "reminder": "⏰ <b>Reminder</b>\n{text}",
        "event_soon": "📅 <b>{title}</b> starts at {time}{location}",
        "digest_title": "☀️ <b>Your day – {date}</b>",
        "digest_tasks": "<b>Tasks</b>",
        "digest_overdue": "overdue",
        "digest_agenda": "<b>Agenda</b>",
        "digest_reminders": "<b>Reminders</b>",
        "digest_empty": "Nothing planned for today. 🎉",
        "linked": "✅ Connected! You will now receive reminders and notifications from Anamnesies here.\n\n{help}",
        "bad_code": "This link code is invalid. Open the link from the Anamnesies settings again.",
        "help": (
            "<b>Commands</b>\n"
            "/today – overview for today\n"
            "/tasks – open tasks\n"
            "/task &lt;title&gt; – new task\n"
            "/remind &lt;when&gt; &lt;text&gt; – e.g. <code>/remind 18:00 Take out the trash</code>, "
            "<code>/remind in 30m Tea</code>, <code>/remind tomorrow 9:00 Call the doctor</code>, "
            "<code>/remind 2026-12-24 10:00 Presents</code>\n"
            "/reminders – upcoming reminders\n"
            "/note &lt;text&gt; – new note (first line = title)\n"
            "/event &lt;when&gt; &lt;title&gt; – e.g. <code>/event tomorrow 14:00 Dentist</code>\n"
            "/project &lt;name&gt; – new project\n\n"
            "Text without a command is saved as a note. <code>#tag</code> adds tags, "
            "<code>@Project</code> assigns a project."
        ),
        "task_created": "✅ Task created: <b>{title}</b>",
        "note_created": "📝 Note saved: <b>{title}</b>",
        "reminder_created": "⏰ I'll remind you on {when}: {text}",
        "reminder_usage": "Usage: <code>/remind 18:00 text</code>, <code>/remind in 2h text</code> or <code>/remind tomorrow 9:00 text</code>",
        "missing_text": "Please add a text, e.g. <code>/{command} Tax return</code>",
        "no_tasks": "No open tasks. 🎉",
        "open_tasks": "<b>Open tasks</b>",
        "no_reminders": "No upcoming reminders.",
        "upcoming_reminders": "<b>Upcoming reminders</b>",
        "unknown": "I didn't understand that. /help lists all commands.",
        "test": "👋 Test message from Anamnesies – Telegram is set up.",
        "commands_disabled": "Commands are disabled in the settings.",
        "event_created": "📅 Event created: <b>{title}</b> on {when}",
        "event_usage": "Usage: <code>/event tomorrow 14:00 Dentist</code> or <code>/event 2026-12-24 18:00 Party</code>",
        "project_created": "📁 Project created: <b>{title}</b>",
        "in_project": " · project <b>{project}</b>",
        "with_tags": " · {tags}",
    },
}

COMMANDS = {
    "start": "start",
    "help": "help", "hilfe": "help",
    "today": "today", "heute": "today",
    "tasks": "tasks", "aufgaben": "tasks",
    "task": "task", "aufgabe": "task", "todo": "task",
    "remind": "remind", "erinnerung": "remind", "erinnere": "remind",
    "reminders": "reminders", "erinnerungen": "reminders",
    "note": "note", "notiz": "note",
    "event": "event", "termin": "event",
    "project": "project", "projekt": "project",
}

BOT_COMMANDS = {
    "de": [("heute", "Überblick für heute"), ("aufgaben", "Offene Aufgaben"), ("aufgabe", "Neue Aufgabe"),
           ("erinnerung", "Neue Erinnerung"), ("erinnerungen", "Anstehende Erinnerungen"), ("notiz", "Neue Notiz"),
           ("termin", "Neuer Termin"), ("projekt", "Neues Projekt"), ("hilfe", "Alle Befehle")],
    "en": [("today", "Overview for today"), ("tasks", "Open tasks"), ("task", "New task"), ("remind", "New reminder"),
           ("reminders", "Upcoming reminders"), ("note", "New note"),
           ("event", "New event"), ("project", "New project"), ("help", "All commands")],
}


# --- Settings -----------------------------------------------------------------------------------



def bot_language(language: str | None) -> str:
    """The bot speaks German and English; every other interface language gets the English bot."""
    return "de" if language == "de" else "en"

def new_link_code() -> str:
    return secrets.token_hex(8)


def get_telegram_settings(db: Session) -> TelegramSettings:
    row = db.get(TelegramSettings, 1)
    if row is None:
        row = TelegramSettings(id=1, link_code=new_link_code())
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def to_read(row: TelegramSettings) -> TelegramRead:
    return TelegramRead(
        enabled=row.enabled,
        token_set=bool(row.bot_token),
        bot_username=row.bot_username,
        linked=bool(row.chat_id),
        chat_name=row.chat_name,
        link_code=row.link_code,
        link_url=f"https://t.me/{row.bot_username}?start={row.link_code}" if row.bot_username else None,
        commands_enabled=row.commands_enabled,
        timezone=row.timezone,
        daily_digest=row.daily_digest,
        digest_time=row.digest_time,
        event_reminder_minutes=row.event_reminder_minutes,
        login_2fa=row.login_2fa,
    )


def _reset_connection(row: TelegramSettings) -> None:
    row.chat_id = None
    row.chat_name = None
    row.update_offset = 0
    row.link_code = new_link_code()
    # Without a linked chat no login code can be delivered, so the second factor is switched off.
    row.login_2fa = False


def update_telegram_settings(db: Session, payload: TelegramUpdate) -> TelegramSettings:
    """Apply settings; a new bot token is validated against Telegram before it is stored."""
    row = get_telegram_settings(db)
    values = payload.model_dump(exclude_unset=True)
    token = values.pop("bot_token", None)
    if token is not None:
        token = token.strip()
        if not token:
            row.bot_token = None
            row.bot_username = None
            _reset_connection(row)
        elif token != row.bot_token:
            me = telegram.get_me(token)
            row.bot_token = token
            row.bot_username = me.get("username")
            _reset_connection(row)
            language = get_app_settings(db).language
            try:
                telegram.call(token, "setMyCommands", commands=[{"command": c, "description": d} for c, d in BOT_COMMANDS[bot_language(language)]])
            except telegram.TelegramError:
                logger.warning("Could not register Telegram bot commands", exc_info=True)
    if values.get("login_2fa") and not is_ready(row):
        raise telegram.TelegramNotConfiguredError("Link your Telegram chat before enabling two-factor login.")
    for field, value in values.items():
        if value is not None:
            setattr(row, field, value)
    if not row.enabled:
        row.login_2fa = False
    db.commit()
    db.refresh(row)
    return row


def unlink(db: Session) -> TelegramSettings:
    row = get_telegram_settings(db)
    _reset_connection(row)
    db.commit()
    db.refresh(row)
    return row


def is_ready(row: TelegramSettings) -> bool:
    return bool(row.enabled and row.bot_token and row.chat_id)


def sender(row: TelegramSettings, db: Session | None = None) -> Send:
    if not is_ready(row):
        raise telegram.TelegramNotConfiguredError("Telegram is not connected. Add a bot token and link your chat in the settings.")
    token, chat_id = row.bot_token or "", row.chat_id or ""

    def send(text: str) -> None:
        telegram.send_message(token, chat_id, text)
        if db is not None:
            log_message(db, "out", text)

    return send


def log_message(db: Session, direction: str, text: str, entity: Any = None) -> None:
    """Keep a history of bot messages; messages that created an entry are tied to it (and its project)."""
    project_id = getattr(entity, "project_id", None) or (entity.id if isinstance(entity, Project) else None)
    db.add(TelegramMessageLog(
        direction=direction,
        text=re.sub(r"<[^>]+>", "", text)[:4000],
        entity_type=type_of(entity) if entity is not None else None,
        entity_id=str(entity.id) if entity is not None else None,
        project_id=str(project_id) if project_id else None,
    ))
    db.commit()


def texts(db: Session) -> dict[str, str]:
    return TEXTS[bot_language(get_app_settings(db).language)]


def local_now(row: TelegramSettings) -> datetime:
    """Current wall-clock time in the configured timezone, without tz info (like stored reminders)."""
    try:
        zone = ZoneInfo(row.timezone)
    except (KeyError, ValueError):
        zone = ZoneInfo("UTC")
    return datetime.now(zone).replace(tzinfo=None, second=0, microsecond=0)


# --- Scheduling ---------------------------------------------------------------------------------


def next_occurrence(when: datetime, repeat: str) -> datetime:
    if repeat == "daily":
        return when + timedelta(days=1)
    if repeat == "weekdays":
        when += timedelta(days=1)
        while when.weekday() >= 5:
            when += timedelta(days=1)
        return when
    if repeat == "weekly":
        return when + timedelta(weeks=1)
    if repeat == "monthly":
        month = when.month % 12 + 1
        year = when.year + (when.month == 12)
        return when.replace(year=year, month=month, day=min(when.day, calendar.monthrange(year, month)[1]))
    return when


def _already_sent(db: Session, key: str) -> bool:
    return db.get(NotificationLog, key) is not None


def _mark_sent(db: Session, key: str) -> None:
    db.add(NotificationLog(key=key))


def process_reminders(db: Session, now: datetime, send: Send) -> int:
    text = texts(db)
    due = db.scalars(select(Reminder).where(Reminder.done.is_(False), Reminder.remind_at <= now).order_by(Reminder.remind_at)).all()
    for reminder in due:
        send(text["reminder"].format(text=escape(reminder.text)))
        reminder.last_sent_at = utcnow()
        if reminder.repeat == "none":
            reminder.done = True
        else:
            upcoming = reminder.remind_at
            while upcoming <= now:
                upcoming = next_occurrence(upcoming, reminder.repeat)
            reminder.remind_at = upcoming
        db.commit()
    return len(due)


def _agenda(db: Session, day: date) -> list[tuple[str, str | None, str | None]]:
    """Events and planned meetings of a day as (title, time, location), sorted by time."""
    events = db.scalars(select(Event).where(Event.date == day, Event.archived_at.is_(None))).all()
    meetings = db.scalars(select(Meeting).where(Meeting.date == day, Meeting.status == "planned", Meeting.archived_at.is_(None))).all()
    entries = [(event.title, event.time, event.location) for event in events] + [(meeting.title, meeting.time, None) for meeting in meetings]
    return sorted(entries, key=lambda entry: entry[1] or "")


def _timed_entries(db: Session, days: list[date]) -> list[tuple[str, str, datetime, str | None]]:
    """Events and planned meetings with a start time on the given days as (key, title, start, location)."""
    entries: list[tuple[str, str, datetime, str | None]] = []
    for event in db.scalars(select(Event).where(Event.date.in_(days), Event.time.is_not(None), Event.archived_at.is_(None))):
        entries.append((f"event:{event.id}", event.title, datetime.combine(event.date, time.fromisoformat(event.time or "")), event.location))
    meetings = select(Meeting).where(Meeting.date.in_(days), Meeting.time.is_not(None), Meeting.status == "planned", Meeting.archived_at.is_(None))
    for meeting in db.scalars(meetings):
        entries.append((f"meeting:{meeting.id}", meeting.title, datetime.combine(meeting.date, time.fromisoformat(meeting.time or "")), None))
    return entries


def process_event_reminders(db: Session, row: TelegramSettings, now: datetime, send: Send) -> int:
    minutes = row.event_reminder_minutes
    if minutes <= 0:
        return 0
    text = texts(db)
    lead = timedelta(minutes=minutes)
    sent = 0
    for key_prefix, title, start, location in _timed_entries(db, sorted({now.date(), (now + lead).date()})):
        key = f"{key_prefix}:{start.isoformat()}"
        if not (start - lead <= now < start) or _already_sent(db, key):
            continue
        suffix = f" · {escape(location)}" if location else ""
        send(text["event_soon"].format(title=escape(title), time=f"{start:%H:%M}", location=suffix))
        _mark_sent(db, key)
        db.commit()
        sent += 1
    return sent


def build_digest(db: Session, day: date, language_texts: dict[str, str] | None = None) -> str:
    text = language_texts or texts(db)
    lines = [text["digest_title"].format(date=day.strftime("%d.%m.%Y"))]
    tasks = db.scalars(
        select(Task).where(Task.status != "done", Task.archived_at.is_(None), Task.due_date.is_not(None), Task.due_date <= day).order_by(Task.due_date)
    ).all()
    agenda = _agenda(db, day)
    start, end = datetime.combine(day, time.min), datetime.combine(day, time.max)
    reminders = db.scalars(
        select(Reminder).where(Reminder.done.is_(False), Reminder.remind_at >= start, Reminder.remind_at <= end).order_by(Reminder.remind_at)
    ).all()
    if agenda:
        lines += ["", text["digest_agenda"]]
        lines += [f"• {when or '—'} {escape(title)}{f' · {escape(place)}' if place else ''}" for title, when, place in agenda]
    if tasks:
        lines += ["", text["digest_tasks"]]
        lines += [f"• {escape(task.title)}{' (' + text['digest_overdue'] + ')' if task.due_date and task.due_date < day else ''}" for task in tasks]
    if reminders:
        lines += ["", text["digest_reminders"]]
        lines += [f"• {reminder.remind_at:%H:%M} {escape(reminder.text)}" for reminder in reminders]
    if not (agenda or tasks or reminders):
        lines += ["", text["digest_empty"]]
    return "\n".join(lines)


def process_digest(db: Session, row: TelegramSettings, now: datetime, send: Send) -> bool:
    if not row.daily_digest:
        return False
    scheduled = datetime.combine(now.date(), time.fromisoformat(row.digest_time))
    key = f"digest:{now.date().isoformat()}"
    # Only send within a few hours after the configured time, e.g. not at night after a late server start.
    if not (scheduled <= now < scheduled + timedelta(hours=3)) or _already_sent(db, key):
        return False
    send(build_digest(db, now.date()))
    _mark_sent(db, key)
    db.commit()
    return True


def run_notifications(db: Session) -> None:
    """One scheduler tick: send due reminders, upcoming event reminders and the daily digest."""
    row = get_telegram_settings(db)
    if not is_ready(row):
        return
    send = sender(row, db)
    now = local_now(row)
    process_reminders(db, now, send)
    process_event_reminders(db, row, now, send)
    process_digest(db, row, now, send)


# --- Bot commands -------------------------------------------------------------------------------

_RELATIVE = re.compile(r"^(?:in\s+)?(\d+)\s*(m|min|h|std|d|t)\b\s*(.*)$", re.IGNORECASE | re.DOTALL)
_TIME = r"(\d{1,2})[:.](\d{2})"


def parse_when(value: str, now: datetime) -> tuple[datetime, str] | None:
    """Parse '<when> <text>' as used by /remind. Returns the local datetime and the remaining text."""
    value = value.strip()
    match = _RELATIVE.match(value)
    if match:
        amount, unit, rest = int(match.group(1)), match.group(2).lower(), match.group(3)
        delta = {"m": timedelta(minutes=amount), "min": timedelta(minutes=amount), "h": timedelta(hours=amount),
                 "std": timedelta(hours=amount), "d": timedelta(days=amount), "t": timedelta(days=amount)}[unit]
        return now + delta, rest.strip()

    # (pattern, day of the match, what to add if the time already passed)
    patterns: list[tuple[str, Callable[[re.Match[str]], date], str | None]] = [
        (rf"^(\d{{4}})-(\d{{2}})-(\d{{2}})\s+{_TIME}", lambda m: date(int(m[1]), int(m[2]), int(m[3])), None),
        (rf"^(\d{{1,2}})\.(\d{{1,2}})\.(\d{{4}})?\s+{_TIME}",
         lambda m: date(int(m[3]) if m[3] else now.year, int(m[2]), int(m[1])), "year"),
        (rf"^(?:morgen|tomorrow)\s+(?:um\s+|at\s+)?{_TIME}", lambda m: now.date() + timedelta(days=1), None),
        (rf"^(?:heute\s+|today\s+)?(?:um\s+|at\s+)?{_TIME}", lambda m: now.date(), "day"),
    ]
    for pattern, day_of, roll in patterns:
        match = re.match(pattern + r"(?!\d)\s*(.*)$", value, re.IGNORECASE | re.DOTALL)
        if not match:
            continue
        hour, minute, rest = match.groups()[-3:]
        try:
            when = datetime.combine(day_of(match), time(int(hour), int(minute)))
        except ValueError:
            return None
        if when <= now and roll == "day":
            when += timedelta(days=1)
        elif when <= now and roll == "year" and not match.group(3):
            when = when.replace(year=when.year + 1)
        return when, rest.strip()
    return None


def _format_when(when: datetime) -> str:
    return when.strftime("%d.%m.%Y %H:%M")


_HASHTAG = re.compile(r"(?<![\w&])#([^\s#@,.;:!?]+)")
_MENTION = re.compile(r"(?<![\w])@(\S+)")


def _slug(value: str) -> str:
    return re.sub(r"[^0-9a-zäöüß]", "", value.lower())


def extract_meta(db: Session, value: str) -> tuple[str, list[str], Project | None]:
    """Pull #tags and an @Project mention out of a message. Unknown @mentions stay in the text."""
    tags = [tag.lower() for tag in _HASHTAG.findall(value)]
    value = _HASHTAG.sub("", value)
    project = None
    projects = {_slug(item.name): item for item in db.scalars(select(Project).where(Project.archived_at.is_(None)))}
    for mention in _MENTION.finditer(value):
        project = projects.get(_slug(mention.group(1)))
        if project:
            value = value.replace(mention.group(0), "", 1)
            break
    value = "\n".join(re.sub(r"[ \t]{2,}", " ", line).strip() for line in value.strip().splitlines())
    return value.strip(), tags, project


def _created_suffix(text: dict[str, str], tags: list[str], project: Project | None) -> str:
    suffix = text["in_project"].format(project=escape(project.name)) if project else ""
    if tags:
        suffix += text["with_tags"].format(tags=" ".join(f"#{escape(tag)}" for tag in tags))
    return suffix


def handle_command(db: Session, row: TelegramSettings, message: str, created: list[Any] | None = None) -> str:
    """Run a bot command. Entities that get created are appended to `created` (for the message log)."""
    text = texts(db)
    created = created if created is not None else []
    if not message.strip().startswith("/"):
        # Plain messages are captured as notes, like an inbox.
        message = f"/note {message}"
    command, _, argument = message.strip().partition(" ")
    name = COMMANDS.get(command.lstrip("/").split("@", 1)[0].lower())
    argument = argument.strip()
    if name in {"help", "start"}:
        return text["help"]
    if not row.commands_enabled:
        return text["commands_disabled"]
    if name == "today":
        return build_digest(db, local_now(row).date(), text)
    if name == "tasks":
        tasks = db.scalars(select(Task).where(Task.status != "done", Task.archived_at.is_(None)).order_by(Task.due_date, Task.created_at)).all()
        if not tasks:
            return text["no_tasks"]
        return "\n".join([text["open_tasks"], *(f"• {escape(task.title)}{f' ({task.due_date:%d.%m.})' if task.due_date else ''}" for task in tasks[:30])])
    if name == "reminders":
        reminders = db.scalars(select(Reminder).where(Reminder.done.is_(False)).order_by(Reminder.remind_at)).all()
        if not reminders:
            return text["no_reminders"]
        return "\n".join([text["upcoming_reminders"], *(f"• {_format_when(r.remind_at)} {escape(r.text)}" for r in reminders[:30])])
    if name in {"task", "note", "project"}:
        argument, tags, project = extract_meta(db, argument)
        if not argument:
            return text["missing_text"].format(command=command.lstrip("/"))
        entity: Task | Note | Project
        if name == "task":
            entity = Task(title=argument.replace("\n", " ")[:255], project_id=project.id if project else None)
            reply = text["task_created"].format(title=escape(entity.title))
        elif name == "project":
            entity = Project(name=argument.replace("\n", " ")[:255])
            reply = text["project_created"].format(title=escape(entity.name))
            project = None
        else:
            title, _, body = argument.partition("\n")
            entity = Note(title=title[:255], content=body.strip() or None, project_id=project.id if project else None, source="telegram")
            reply = text["note_created"].format(title=escape(entity.title))
        db.add(entity)
        db.commit()
        if tags:
            organization.add_entity_tags(db, type_of(entity) or name, entity.id, tags)
        created.append(entity)
        return reply + _created_suffix(text, tags, project)
    if name == "event":
        argument, tags, project = extract_meta(db, argument)
        parsed = parse_when(argument, local_now(row))
        if not parsed or not parsed[1]:
            return text["event_usage"]
        when, title = parsed
        event = Event(title=title.replace("\n", " ")[:255], date=when.date(), time=when.strftime("%H:%M"), project_id=project.id if project else None)
        db.add(event)
        db.commit()
        if tags:
            organization.add_entity_tags(db, "event", event.id, tags)
        created.append(event)
        return text["event_created"].format(title=escape(event.title), when=_format_when(when)) + _created_suffix(text, tags, project)
    if name == "remind":
        parsed = parse_when(argument, local_now(row))
        if not parsed or not parsed[1]:
            return text["reminder_usage"]
        when, reminder_text = parsed
        db.add(Reminder(text=reminder_text[:2000], remind_at=when))
        db.commit()
        return text["reminder_created"].format(when=_format_when(when), text=escape(reminder_text))
    return text["unknown"]


def handle_update(db: Session, row: TelegramSettings, update: dict[str, Any]) -> tuple[str, str] | None:
    """Process one Telegram update. Returns (chat_id, reply) or None if nothing should be sent."""
    message = update.get("message") or update.get("edited_message")
    if not message or "text" not in message:
        return None
    chat = message.get("chat", {})
    chat_id = str(chat.get("id"))
    content: str = message["text"]
    text = texts(db)

    if content.startswith("/start"):
        code = content.partition(" ")[2].strip()
        if code and secrets.compare_digest(code, row.link_code):
            row.chat_id = chat_id
            row.chat_name = " ".join(filter(None, [chat.get("first_name"), chat.get("last_name")])) or chat.get("username") or chat.get("title")
            row.link_code = new_link_code()
            db.commit()
            return chat_id, text["linked"].format(help=text["help"])
        if chat_id != row.chat_id:
            return chat_id, text["bad_code"]

    # Only the linked chat may use the bot; everyone else is ignored.
    if chat_id != row.chat_id:
        return None
    created: list[Any] = []
    with activity.source("telegram"):
        reply = handle_command(db, row, content, created)
    log_message(db, "in", content, created[0] if created else None)
    log_message(db, "out", reply, created[0] if created else None)
    return chat_id, reply
