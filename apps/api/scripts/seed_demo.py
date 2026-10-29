"""Fill the database with realistic demo data (hundreds of notes and tasks, projects, events, archive,
Telegram history, activity and API usage), so every view and statistic can be tried out in development.

Usage (from apps/api):  .venv/Scripts/python -m scripts.seed_demo [--scale 1.0]

The data is added to whatever DATABASE_URL points at; existing entries are left untouched.
Demo data never triggers Telegram messages: reminders are history only (already done) and the
notification log marks upcoming demo events and meetings as already announced.
"""

import argparse
import random
import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal, _add_missing_columns, engine
from app.models import (
    ActivityLog, ApiUsage, EntityLink, EntityTag, Event, Folder, Idea, KnowledgeArticle, ListItem, Meeting, Note, NotificationLog, Project, Record,
    Reminder, Tag, Task, TelegramMessageLog, WorkspaceList,
)
from app.models.base import Base

NOW = datetime.now(timezone.utc)
TODAY = date.today()

PROJECTS = [
    ("Website-Relaunch Kunde A", "Neue Website mit CMS, SEO und Shop-Anbindung.", "active"),
    ("App-Launch Fitbit-Clone", "MVP für iOS und Android bis Ende Q1.", "active"),
    ("Umzug nach Hamburg", "Wohnung, Ummeldung, Umzugsfirma, Kisten.", "active"),
    ("Steuererklärung 2025", "Belege sammeln, Elster, Rückfragen Finanzamt.", "on_hold"),
    ("Marathon-Training", "16-Wochen-Plan für den Berlin-Marathon.", "active"),
    ("Kunde B – CRM-Migration", "Migration von Salesforce nach HubSpot.", "active"),
    ("Buchprojekt: Wissensarbeit", "Kapitelstruktur, Recherche, Lektorat.", "active"),
    ("Hochzeit Lena & Tom", "Location, Gäste, Dienstleister, Ablauf.", "completed"),
    ("Homelab & NAS", "Proxmox, Backups, Monitoring.", "active"),
    ("Konferenz-Talk KI-Agenten", "Vortrag für die DevCon im Herbst.", "on_hold"),
    ("Garten-Renovierung", "Hochbeete, Bewässerung, Terrasse.", "completed"),
    ("Kunde C – Datenplattform", "Data Warehouse und Dashboards.", "active"),
]

FOLDERS = {
    "Privat": ["Gesundheit", "Finanzen", "Reisen", "Haushalt"],
    "Arbeit": ["Projekte", "Meetings", "Kunden", "Retros"],
    "Wissen": ["Programmierung", "KI", "Produktivität", "Design"],
    "Journal": ["2025", "2026"],
    "Ideen-Inbox": [],
}

TAGS = [
    "kunde", "planung", "idee", "recherche", "wichtig", "dringend", "finanzen", "gesundheit", "reise", "sport", "lesen",
    "python", "typescript", "react", "ki", "llm", "datenbank", "design", "meeting", "retro", "familie", "haushalt",
    "steuer", "bug", "feature", "marketing", "seo", "buch", "garten", "homelab", "backup", "workshop", "fokus", "journal", "rezept",
]

TOPICS = [
    ("Kickoff", "Ziele, Scope und Verantwortlichkeiten klären."), ("Retrospektive", "Was lief gut, was nicht, was ändern wir?"),
    ("Recherche", "Quellen und Erkenntnisse gesammelt."), ("Entscheidung", "Optionen bewertet und eine Entscheidung getroffen."),
    ("Protokoll", "Besprochene Punkte und nächste Schritte."), ("Checkliste", "Alles, was vorher erledigt sein muss."),
    ("Leseliste", "Bücher und Artikel, die ich lesen will."), ("Lernnotizen", "Zusammenfassung der wichtigsten Konzepte."),
    ("Wochenrückblick", "Highlights, Learnings und offene Punkte."), ("Brainstorming", "Ungefilterte Ideen zum Thema."),
    ("Anleitung", "Schritt für Schritt, damit ich es nicht wieder vergesse."), ("Budget", "Kosten, Puffer und offene Rechnungen."),
]
SUBJECTS = [
    "React Server Components", "PostgreSQL Indizes", "Vektordatenbanken", "Prompt Engineering", "Docker Compose", "Kubernetes Basics",
    "Team-Onboarding", "Quartalsplanung", "Steuerbelege", "Arzttermine", "Urlaub Portugal", "Lauftraining", "Meal Prep",
    "Backup-Strategie", "Tailwind Patterns", "FastAPI Middleware", "MCP-Server", "Zettelkasten", "Deep Work", "Landingpage",
    "Angebot Kunde A", "CRM-Datenmodell", "Hochbeet-Planung", "Proxmox Cluster", "Vortragsfolien", "Kapitel 3", "Lighthouse Score",
    "OAuth Flow", "Telegram Bot", "SQLite vs. Postgres", "Monatsabschluss", "Fahrradreparatur", "Geschenkideen", "Wohnungssuche",
]
BULLETS = [
    "Anforderungen mit dem Team abstimmen", "Offene Fragen sammeln und priorisieren", "Erste Version bis Freitag fertig",
    "Feedback von Lena einholen", "Kosten grob schätzen", "Risiken dokumentieren", "Termin für Review blocken",
    "Alternativen vergleichen", "Messbare Ziele festlegen", "Doku im Wiki aktualisieren", "Tests ergänzen", "Budget prüfen",
]
TASK_VERBS = ["Entwurf schreiben für", "Review von", "Recherche zu", "Termin vereinbaren wegen", "Angebot einholen für", "Bug fixen in",
              "Feedback einarbeiten zu", "Dokumentation für", "Rechnung bezahlen für", "Präsentation vorbereiten zu", "Backup prüfen für", "Aufräumen:"]
EVENT_TITLES = ["Zahnarzt", "Team-Standup", "Sprint Review", "Mittagessen mit Max", "Yoga", "Physiotherapie", "Elternabend", "Steuerberater",
                "Kundentermin", "Webinar", "Geburtstag Oma", "Laufgruppe", "Werkstatt", "Friseur", "Konzert", "Flug nach Lissabon", "Workshop"]
LOCATIONS = [None, "Büro", "Zoom", "Praxis Dr. Weber", "Café Central", "Hamburg", "Berlin", "Zuhause", "Google Meet"]
PEOPLE = ["Lena", "Tom", "Max", "Sarah", "Jonas", "Aylin", "Mehmet", "Julia", "Paul", "Nina", "Felix", "Clara"]


def past(days_max: int, bias: float = 2.2) -> datetime:
    """A random moment in the last `days_max` days, more often recent (bias > 1)."""
    days = days_max * random.random() ** bias
    return NOW - timedelta(days=days, minutes=random.randint(0, 600))


def markdown_body(subject: str, kind: str, notes_titles: list[str]) -> str:
    lines = [f"## {kind}: {subject}", "", random.choice(TOPICS)[1], ""]
    lines += [f"- {item}" for item in random.sample(BULLETS, random.randint(2, 5))]
    if random.random() < 0.5:
        lines += ["", "### Aufgaben", *[f"- [{'x' if random.random() < 0.4 else ' '}] {item}" for item in random.sample(BULLETS, 3)]]
    if random.random() < 0.35:
        lines += ["", "> " + random.choice(["Weniger, aber besser.", "Erst verstehen, dann bauen.", "Done is better than perfect.", "Klein anfangen, oft liefern."])]
    if notes_titles and random.random() < 0.3:
        lines += ["", f"Siehe auch [[{random.choice(notes_titles)}]]."]
    if random.random() < 0.2:
        lines += ["", "```python", "def hello(name: str) -> str:", "    return f'Hallo {name}'", "```"]
    return "\n".join(lines)


def seed(db: Session, scale: float) -> dict[str, int]:
    n = lambda base: max(1, int(base * scale))  # noqa: E731
    activity: list[dict] = []
    added: dict[str, int] = {}

    def track(entity_type: str, entity, created: datetime, title: str, project_id=None, source: str = "app", updates: int = 0) -> None:
        activity.append({"at": created, "action": "create", "entity_type": entity_type, "entity_id": str(entity.id), "title": title[:255] or None,
                         "project_id": str(project_id) if project_id else None, "source": source})
        for _ in range(updates):
            moment = created + (NOW - created) * random.random()
            activity.append({"at": moment, "action": "update", "entity_type": entity_type, "entity_id": str(entity.id), "title": title[:255] or None,
                             "project_id": str(project_id) if project_id else None, "source": random.choice(["app", "app", "app", "mcp"])})

    def archive(entity_type: str, entity, title: str, project_id=None) -> None:
        moment = entity.created_at + (NOW - entity.created_at) * (0.5 + random.random() / 2)
        entity.archived_at = moment
        activity.append({"at": moment, "action": "archive", "entity_type": entity_type, "entity_id": str(entity.id), "title": title[:255] or None,
                         "project_id": str(project_id) if project_id else None, "source": "app"})

    # Projects
    projects = []
    for name, description, status in PROJECTS:
        created = past(380, 1.0)
        project = Project(id=uuid.uuid4(), name=name, description=description, status=status, created_at=created, updated_at=past((NOW - created).days or 1))
        projects.append(project)
        track("project", project, created, name, project.id, updates=random.randint(1, 4))
    archive("project", projects[-1], projects[-1].name, projects[-1].id)
    db.add_all(projects)
    added["projects"] = len(projects)
    active_projects = [project for project in projects if project.archived_at is None]
    pick_project = lambda chance: random.choice(active_projects).id if random.random() < chance else None  # noqa: E731

    # Folders
    folders: list[Folder] = []
    for position, (parent_name, children) in enumerate(FOLDERS.items()):
        parent = Folder(id=uuid.uuid4(), name=parent_name, position=position, favorite=parent_name == "Wissen", pinned=parent_name == "Arbeit",
                        created_at=past(380, 1.0))
        folders.append(parent)
        for index, child in enumerate(children):
            folders.append(Folder(id=uuid.uuid4(), name=child, parent_id=parent.id, position=index, created_at=past(300, 1.0)))
    for folder in folders:
        folder.updated_at = folder.created_at
        track("folder", folder, folder.created_at, folder.name)
    db.add_all(folders)
    added["folders"] = len(folders)

    # Tags
    existing_tags = {tag.name: tag for tag in db.scalars(select(Tag))}
    tags = {name: existing_tags.get(name) or Tag(id=uuid.uuid4(), name=name, created_at=past(380, 1.0)) for name in TAGS}
    db.add_all([tag for name, tag in tags.items() if name not in existing_tags])
    assignments: set[tuple[uuid.UUID, str, uuid.UUID]] = set()

    def tag(entity_type: str, entity_id: uuid.UUID, count: int) -> None:
        for name in random.sample(TAGS, count):
            assignments.add((tags[name].id, entity_type, entity_id))

    # Notes
    notes: list[Note] = []
    titles: list[str] = []
    for index in range(n(420)):
        kind, _ = random.choice(TOPICS)
        subject = random.choice(SUBJECTS)
        title = f"{kind}: {subject}" if random.random() < 0.7 else f"{subject} – {random.choice(['Notizen', 'Gedanken', 'Zusammenfassung', 'Plan', 'Log'])}"
        if title in titles:
            title = f"{title} ({index})"
        created = past(365)
        source = random.choices(["app", "telegram", "mcp"], weights=[75, 15, 10])[0]
        note = Note(
            id=uuid.uuid4(), title=title, content=markdown_body(subject, kind, titles[-40:]),
            folder_id=random.choice(folders).id if random.random() < 0.8 else None, project_id=pick_project(0.35),
            pinned=random.random() < 0.025, source=source, created_at=created, updated_at=created + (NOW - created) * random.random() ** 3,
        )
        notes.append(note)
        titles.append(title)
        track("note", note, created, title, note.project_id, source=source, updates=random.randint(0, 5))
        tag("note", note.id, random.choice([0, 1, 1, 2, 2, 3]))
    for note in random.sample(notes, n(35)):
        archive("note", note, note.title, note.project_id)
    db.add_all(notes)
    added["notes"] = len(notes)

    # Tasks
    tasks: list[Task] = []
    for _ in range(n(380)):
        created = past(330)
        status = random.choices(["todo", "in-progress", "done"], weights=[45, 15, 40])[0]
        due = TODAY + timedelta(days=random.randint(-40, 60)) if random.random() < 0.65 else None
        task = Task(
            id=uuid.uuid4(), title=f"{random.choice(TASK_VERBS)} {random.choice(SUBJECTS)}",
            description=random.choice([None, None, random.choice(BULLETS) + "."]), status=status,
            priority=random.choices(["low", "medium", "high"], weights=[25, 50, 25])[0], due_date=due, project_id=pick_project(0.55),
            created_at=created, updated_at=created + (NOW - created) * random.random() ** 2,
        )
        tasks.append(task)
        track("task", task, created, task.title, task.project_id, updates=random.randint(0, 3) + (1 if status == "done" else 0))
        tag("task", task.id, random.choice([0, 0, 1, 1, 2]))
    for task in random.sample([task for task in tasks if task.status == "done"], n(30)):
        archive("task", task, task.title, task.project_id)
    db.add_all(tasks)
    added["tasks"] = len(tasks)

    # Events and meetings
    events: list[Event] = []
    for _ in range(n(160)):
        day = TODAY + timedelta(days=random.randint(-150, 90))
        created = min(NOW, datetime.combine(day, time(9), tzinfo=timezone.utc) - timedelta(days=random.randint(1, 30)))
        event = Event(id=uuid.uuid4(), title=random.choice(EVENT_TITLES), date=day, time=random.choice([None, f"{random.randint(7, 20):02d}:{random.choice(['00', '15', '30', '45'])}"]),
                      location=random.choice(LOCATIONS), description=random.choice([None, random.choice(BULLETS)]), project_id=pick_project(0.3),
                      created_at=created, updated_at=created)
        events.append(event)
        track("event", event, created, event.title, event.project_id, updates=random.randint(0, 1))
        tag("event", event.id, random.choice([0, 0, 1]))
    for event in random.sample([event for event in events if event.date < TODAY], n(15)):
        archive("event", event, event.title, event.project_id)
    db.add_all(events)
    added["events"] = len(events)

    meetings: list[Meeting] = []
    for _ in range(n(70)):
        day = TODAY + timedelta(days=random.randint(-120, 45))
        created = min(NOW, datetime.combine(day, time(8), tzinfo=timezone.utc) - timedelta(days=random.randint(1, 20)))
        topic = random.choice(["Kickoff", "Weekly", "Sprint Planning", "Retro", "Kundentermin", "1:1", "Design Review", "Steering"])
        meeting = Meeting(
            id=uuid.uuid4(), title=f"{topic} {random.choice(SUBJECTS)}", date=day, time=f"{random.randint(8, 17):02d}:{random.choice(['00', '30'])}",
            attendees=", ".join(random.sample(PEOPLE, random.randint(2, 5))), agenda="\n".join(f"- {item}" for item in random.sample(BULLETS, 3)),
            notes="\n".join(f"- {item}" for item in random.sample(BULLETS, 2)) if day < TODAY else None,
            status="done" if day < TODAY else random.choice(["planned", "planned", "cancelled"]), project_id=pick_project(0.6),
            created_at=created, updated_at=created,
        )
        meetings.append(meeting)
        track("meeting", meeting, created, meeting.title, meeting.project_id, updates=random.randint(0, 2))
        tag("meeting", meeting.id, random.choice([0, 1]))
    db.add_all(meetings)
    added["meetings"] = len(meetings)

    # Documents, ideas, reminders, records, lists
    documents = []
    for _ in range(n(60)):
        subject = random.choice(SUBJECTS)
        created = past(365)
        doc = KnowledgeArticle(id=uuid.uuid4(), title=f"{random.choice(['Leitfaden', 'Cheat Sheet', 'Spezifikation', 'Notizen', 'How-to'])}: {subject}",
                               content=markdown_body(subject, "Dokument", titles[:60]), category=random.choice(["Technik", "Prozesse", "Privat", "Kunden", None]),
                               source_url=random.choice([None, "https://example.com/artikel"]), project_id=pick_project(0.4), created_at=created, updated_at=created)
        documents.append(doc)
        track("knowledge", doc, created, doc.title, doc.project_id, updates=random.randint(0, 3))
        tag("knowledge", doc.id, random.choice([1, 2, 2, 3]))
    for doc in random.sample(documents, n(6)):
        archive("knowledge", doc, doc.title, doc.project_id)
    db.add_all(documents)
    added["documents"] = len(documents)

    ideas = []
    for _ in range(n(60)):
        created = past(365)
        idea = Idea(id=uuid.uuid4(), title=f"{random.choice(['App für', 'Blogpost über', 'Workshop zu', 'Automatisierung für', 'Side Project:'])} {random.choice(SUBJECTS)}",
                    description=random.choice(BULLETS) + ".", status=random.choice(["new", "exploring", "planned", "archived"]), project_id=pick_project(0.15),
                    created_at=created, updated_at=created)
        ideas.append(idea)
        track("idea", idea, created, idea.title, idea.project_id)
        tag("idea", idea.id, random.choice([0, 1, 2]))
    db.add_all(ideas)
    added["ideas"] = len(ideas)

    # Only past, completed reminders: pending ones would really be sent to the linked Telegram chat.
    reminders = []
    for _ in range(n(45)):
        when = datetime.combine(TODAY - timedelta(days=random.randint(1, 60)), time(random.randint(7, 21), random.choice([0, 15, 30, 45])))
        reminders.append(Reminder(id=uuid.uuid4(), text=random.choice(["Medikamente nehmen", "Müll rausbringen", "Pflanzen gießen", "Rechnung bezahlen", "Mama anrufen",
                                                                       "Backup prüfen", "Laufen gehen", "Wochenreview", "Paket abholen"]),
                                  remind_at=when, repeat=random.choice(["none", "none", "daily", "weekly", "monthly", "weekdays"]),
                                  done=True, last_sent_at=when.replace(tzinfo=timezone.utc), created_at=past(90), updated_at=past(30)))
    db.add_all(reminders)
    added["reminders"] = len(reminders)

    db.add_all([Record(id=uuid.uuid4(), name=f"Datensatz {index:03d} – {random.choice(SUBJECTS)}", status=random.choice(["Active", "In progress", "Review", "Draft"]),
                       created_at=past(365), updated_at=past(120)) for index in range(n(90))])
    added["records"] = n(90)

    for title, category, items in [
        ("Einkaufsliste", "Haushalt", ["Hafermilch", "Brot", "Tomaten", "Kaffee", "Spülmittel", "Äpfel", "Feta"]),
        ("Packliste Portugal", "Reisen", ["Reisepass", "Sonnencreme", "Badehose", "Ladekabel", "Kopfhörer", "Buch"]),
        ("Bücher 2026", "Lesen", ["Deep Work", "Building a Second Brain", "Atomic Habits", "The Pragmatic Programmer", "Thinking, Fast and Slow"]),
        ("Umzug Checkliste", "Umzug", ["Kartons besorgen", "Nachsendeauftrag", "Ummelden", "Internet kündigen", "Schlüsselübergabe"]),
        ("Geschenkideen", "Familie", ["Kochkurs", "Fotobuch", "Pflanze", "Konzertkarten"]),
    ]:
        workspace_list = WorkspaceList(id=uuid.uuid4(), title=title, category=category, created_at=past(200), updated_at=past(30))
        workspace_list.items = [ListItem(id=uuid.uuid4(), text=text, done=random.random() < 0.4, position=index) for index, text in enumerate(items)]
        db.add(workspace_list)
    added["lists"] = 5

    # Links between entries (note ↔ task/note/project/event ...)
    link_pairs: set[tuple] = set()
    pools = {"note": notes, "task": tasks, "event": events, "meeting": meetings, "project": active_projects, "knowledge": documents}
    for _ in range(n(220)):
        source_type, target_type = random.choice([("note", "note"), ("note", "task"), ("note", "project"), ("note", "event"), ("task", "project"),
                                                  ("event", "project"), ("meeting", "note"), ("knowledge", "note"), ("task", "task")])
        source, target = random.choice(pools[source_type]), random.choice(pools[target_type])
        if source.id != target.id:
            link_pairs.add((source_type, source.id, target_type, target.id))
    db.add_all([EntityLink(source_type=a, source_id=b, target_type=c, target_id=d, created_at=past(300)) for a, b, c, d in link_pairs])
    db.add_all([EntityTag(tag_id=tag_id, entity_type=entity_type, entity_id=entity_id) for tag_id, entity_type, entity_id in assignments])
    added["links"] = len(link_pairs)
    added["tag_assignments"] = len(assignments)

    # Restores and deletions (history only) so the archive statistics have something to show.
    for note in random.sample([note for note in notes if note.archived_at is None], n(12)):
        moment = past(200)
        activity.append({"at": moment - timedelta(days=3), "action": "archive", "entity_type": "note", "entity_id": str(note.id), "title": note.title, "project_id": None, "source": "app"})
        activity.append({"at": moment, "action": "restore", "entity_type": "note", "entity_id": str(note.id), "title": note.title, "project_id": None, "source": "app"})
    for _ in range(n(40)):
        activity.append({"at": past(300), "action": "delete", "entity_type": random.choice(["note", "task", "event"]), "entity_id": str(uuid.uuid4()),
                         "title": f"{random.choice(TASK_VERBS)} {random.choice(SUBJECTS)}", "project_id": None, "source": "app"})
    db.add_all([ActivityLog(**entry) for entry in activity])
    added["activity"] = len(activity)

    # Telegram history: messages that created notes/tasks/events, plus digests and reminders sent by the bot.
    telegram: list[TelegramMessageLog] = []
    for note in [note for note in notes if note.source == "telegram"]:
        incoming = note.title + (f" @{next((p.name for p in projects if p.id == note.project_id), '').replace(' ', '')}" if note.project_id else "")
        telegram.append(TelegramMessageLog(at=note.created_at, direction="in", text=incoming, entity_type="note", entity_id=str(note.id), project_id=str(note.project_id) if note.project_id else None))
        telegram.append(TelegramMessageLog(at=note.created_at + timedelta(seconds=2), direction="out", text=f"📝 Notiz gespeichert: {note.title}",
                                           entity_type="note", entity_id=str(note.id), project_id=str(note.project_id) if note.project_id else None))
    for task in random.sample(tasks, n(40)):
        telegram.append(TelegramMessageLog(at=task.created_at, direction="in", text=f"/aufgabe {task.title}", entity_type="task", entity_id=str(task.id), project_id=str(task.project_id) if task.project_id else None))
        telegram.append(TelegramMessageLog(at=task.created_at + timedelta(seconds=2), direction="out", text=f"✅ Aufgabe angelegt: {task.title}", entity_type="task", entity_id=str(task.id),
                                           project_id=str(task.project_id) if task.project_id else None))
    for days_ago in range(0, 120, 1):
        if random.random() < 0.7:
            telegram.append(TelegramMessageLog(at=NOW - timedelta(days=days_ago, hours=random.randint(0, 3)), direction="out", text="☀️ Dein Tag – Aufgaben, Termine und Erinnerungen"))
        if random.random() < 0.3:
            telegram.append(TelegramMessageLog(at=NOW - timedelta(days=days_ago, hours=random.randint(4, 12)), direction="out", text=f"⏰ Erinnerung\n{random.choice(['Medikamente nehmen', 'Pflanzen gießen', 'Wochenreview'])}"))
    db.add_all(telegram)
    added["telegram_messages"] = len(telegram)

    # Upcoming demo events/meetings count as already announced, so the bot stays quiet about them.
    for prefix, entries in (("event", events), ("meeting", meetings)):
        for entry in entries:
            if entry.time and entry.date >= TODAY:
                key = f"{prefix}:{entry.id}:{datetime.combine(entry.date, time.fromisoformat(entry.time)).isoformat()}"
                if db.get(NotificationLog, key) is None:
                    db.add(NotificationLog(key=key))

    # API usage for the last 60 days.
    for days_ago in range(60):
        day = (TODAY - timedelta(days=days_ago)).isoformat()
        for channel, base in (("api", 380), ("mcp", 40)):
            if db.get(ApiUsage, (day, channel)) is None:
                db.add(ApiUsage(day=day, channel=channel, count=int(base * (0.3 + random.random()) * (0.4 if date.fromisoformat(day).weekday() >= 5 else 1))))
    db.commit()
    return added


IMAGE_NAMES = ["Whiteboard Kickoff", "Moodboard Website", "Urlaub Lissabon", "Hochbeet Skizze", "Screenshot Dashboard", "Team-Event", "Wohnung Grundriss",
               "Laufstrecke", "Rezept Ramen", "Konferenz Bühne", "Produktfoto", "Notizbuch Seite", "Architektur Diagramm", "Sonnenuntergang", "Garten Vorher", "Garten Nachher"]
DOC_NAMES = ["Angebot", "Protokoll", "Konzept", "Leitfaden", "Vertrag Entwurf", "Spezifikation", "Rechnung", "Briefing"]


def seed_files(db: Session, scale: float) -> int:
    """Generated images, PDFs and Office files, attached to notes, tasks and projects."""
    from io import BytesIO

    from scripts import demo_files
    from app.services import files as file_service

    n = lambda base: max(1, int(base * scale))  # noqa: E731
    projects = list(db.scalars(select(Project).where(Project.archived_at.is_(None))))
    notes = list(db.scalars(select(Note).where(Note.archived_at.is_(None)).limit(300)))
    tasks = list(db.scalars(select(Task).where(Task.archived_at.is_(None)).limit(300)))
    created: list[tuple[object, datetime]] = []

    def store(name: str, payload: bytes, description: str | None, project_id) -> object:
        stored = file_service.save(db, name, BytesIO(payload), project_id=project_id, description=description)
        moment = past(240)
        stored.created_at = stored.updated_at = moment
        created.append((stored, moment))
        return stored

    for index in range(n(36)):
        width, height = random.choice([(480, 320), (320, 420), (480, 360), (360, 360)])
        name = f"{random.choice(IMAGE_NAMES)} {index + 1}.png"
        store(name, demo_files.png(width, height, seed=index), random.choice([None, "Foto vom Termin", "Skizze für das Projekt", "Inspiration"]),
              random.choice(projects).id if projects and random.random() < 0.6 else None)
    for index in range(n(14)):
        title = f"{random.choice(DOC_NAMES)} {random.choice(SUBJECTS)}"
        store(f"{title}.pdf", demo_files.pdf(title, random.sample(BULLETS, 5)), "PDF-Export", random.choice(projects).id if projects and random.random() < 0.7 else None)
    for index in range(n(10)):
        title = f"{random.choice(DOC_NAMES)} {random.choice(SUBJECTS)}"
        store(f"{title}.docx", demo_files.docx(title, random.sample(BULLETS, 6)), None, random.choice(projects).id if projects and random.random() < 0.7 else None)
    for index in range(n(8)):
        title = f"Budget {random.choice(SUBJECTS)}"
        rows = [["Posten", "Betrag", "Status"], *[[item, random.randint(50, 4000), random.choice(["offen", "bezahlt"])] for item in random.sample(BULLETS, 6)]]
        store(f"{title}.xlsx", demo_files.xlsx(title, rows), "Kalkulation", random.choice(projects).id if projects and random.random() < 0.8 else None)
    db.commit()

    # Attach files to entries and embed some images in notes.
    targets = [("note", note) for note in notes] + [("task", task) for task in tasks] + [("project", project) for project in projects]
    for stored, moment in created:
        for _ in range(random.choice([0, 1, 1, 2])):
            if not targets:
                break
            entity_type, entity = random.choice(targets)
            db.add(EntityLink(source_type=entity_type, source_id=entity.id, target_type="file", target_id=stored.id, created_at=moment))
        db.add(ActivityLog(at=moment, action="create", entity_type="file", entity_id=str(stored.id), title=stored.name, project_id=str(stored.project_id) if stored.project_id else None, source="app"))
    images = [stored for stored, _ in created if stored.kind == "image"]
    for note, image in zip(random.sample(notes, min(len(notes), n(12))), images):
        note.content = (note.content or "") + f"\n\n![{image.name}](/api/v1/files/{image.id}/content)"
        db.add(EntityLink(source_type="note", source_id=note.id, target_type="file", target_id=image.id, created_at=NOW))
    db.commit()
    return len(created)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--scale", type=float, default=1.0, help="Multiply the amount of generated data (default 1.0)")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible data")
    parser.add_argument("--files-only", action="store_true", help="Only add demo images and documents (e.g. to an already seeded database)")
    args = parser.parse_args()
    random.seed(args.seed)
    # Create tables/columns without installing the activity listener: the history is written explicitly with past timestamps.
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _add_missing_columns(Base.metadata)
    with SessionLocal() as db:
        added = {} if args.files_only else seed(db, args.scale)
        added["files"] = seed_files(db, args.scale)
    print("Demo data added:", ", ".join(f"{key}={value}" for key, value in added.items()))


if __name__ == "__main__":
    main()
