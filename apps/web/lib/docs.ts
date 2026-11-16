/** Built-in documentation shown under Docs. Each section is a list of simple blocks. */

export type DocBlock =
  | { p: string }
  | { h: string }
  | { list: string[] }
  | { steps: string[] }
  | { code: string }
  | { tip: string }
  | { table: [string, string][] };

export type DocSection = { id: string; title: string; summary: string; blocks: DocBlock[] };

const de: DocSection[] = [
  {
    id: 'start', title: 'Willkommen', summary: 'Was Anamnesies ist und wie alles zusammenhängt.',
    blocks: [
      { p: 'Anamnesies ist dein persönlicher, lokal laufender Workspace für Wissen, Projekte und Organisation. Notizen, Aufgaben, Termine, Dokumente und Dateien liegen in einer Datenbank auf deinem Rechner und lassen sich frei miteinander verknüpfen.' },
      { h: 'Die Bereiche' },
      { table: [
        ['Planen', 'Projekte, Aufgaben, Kalender, Erinnerungen, Meetings'],
        ['Wissen', 'Notizen, Dokumente, Graph, Tags, Dateien, Bilder, Listen, Ideen'],
        ['System', 'Archiv, Datenbank, Telegram, MCP & KI, Entwickler'],
      ] },
      { h: 'Die Grundidee' },
      { list: [
        'Alles kann Tags haben – ein Klick auf einen Tag zeigt alle Inhalte damit.',
        'Alles kann einem Projekt zugeordnet werden – das Projekt wird zum Workspace.',
        'Alles kann mit allem verknüpft werden – Backlinks zeigen, was worauf verweist.',
        'Nichts muss gelöscht werden – das Archiv hebt Erledigtes auf.',
      ] },
      { tip: 'Mit Strg + K (Mac: ⌘ + K) öffnest du jederzeit die globale Suche.' },
    ],
  },
  {
    id: 'setup', title: 'Einrichtung', summary: 'Installation, Start, Konten und Anmeldung.',
    blocks: [
      { h: 'Voraussetzungen' },
      { list: ['Node.js 20+ und npm', 'Python 3.11+', 'Optional: Docker (für PostgreSQL)'] },
      { h: 'Starten' },
      { steps: ['Abhängigkeiten installieren: npm install im Projektordner.', 'API einrichten: in apps/api eine virtuelle Umgebung anlegen und pip install -e . ausführen.', 'API starten (Port 8000) und danach die Weboberfläche (Port 3000).', 'Im Browser http://localhost:3000 öffnen. Beim ersten Start legst du das Admin-Konto an; es übernimmt den bestehenden Workspace.'] },
      { code: 'cd apps/api\nuvicorn app.main:app --host 0.0.0.0 --port 8000\n\ncd apps/web\nnpm run dev' },
      { h: 'Konfiguration' },
      { table: [
        ['AUTH_MODE', 'multi (Standard): Anmeldung mit Benutzername und Passwort, jedes Konto hat einen eigenen Workspace · single: ohne Konten, ein lokaler Workspace'],
        ['WORKSPACES_DIR', 'Datenbanken und Dateien der weiteren Konten (Standard: apps/api/data/workspaces)'],
        ['SESSION_DAYS', 'Wie lange eine Anmeldung ohne Nutzung gültig bleibt (Standard: 30)'],
        ['DATABASE_URL', 'z. B. sqlite:///./plm.sqlite3 – sonst PostgreSQL über POSTGRES_*'],
        ['UPLOAD_DIR', 'Speicherort für Dateien (Standard: apps/api/data/uploads)'],
        ['MAX_UPLOAD_MB', 'Maximale Dateigröße (Standard: 25)'],
        ['SCHEDULER_ENABLED', 'Hintergrunddienste für Erinnerungen und Telegram'],
      ] },
      { tip: 'Tabellen und neue Spalten werden beim Start der API automatisch angelegt – es sind keine Migrationen nötig.' },
      { h: 'Konten' },
      { list: ['Admins verwalten Konten unter Einstellungen › Benutzer: anlegen, Passwort zurücksetzen, deaktivieren, löschen.', 'Jedes Konto hat einen eigenen Workspace: Daten, Dateien, Einstellungen, Telegram-Bot und MCP-Token sind getrennt.', 'Unter Einstellungen › Konto änderst du dein Passwort und meldest einzelne Browser ab.', 'Passwort vergessen? Auf dem Server: python -m scripts.users password <name> (in apps/api).'] },
    ],
  },
  {
    id: 'navigation', title: 'Navigation & Suche', summary: 'Seitenleiste, Brotkrumen und die globale Suche.',
    blocks: [
      { p: 'Die Seitenleiste lässt sich oben links einklappen. Die Brotkrumen in der Kopfzeile zeigen immer den kompletten Pfad, z. B. Start › Projekte › Kunde A › Meetings › Kickoff – jeder Teil ist anklickbar.' },
      { h: 'Globale Suche' },
      { list: ['Strg + K oder Klick auf das Suchfeld in der Mitte der Kopfzeile.', 'Durchsucht Titel und Inhalte von Notizen, Aufgaben, Projekten, Terminen, Meetings, Dokumenten, Dateien, Ideen und Tags.', 'Mit den Chips filterst du auf einen Typ, Treffer werden hervorgehoben.', 'Pfeiltasten zum Navigieren, Enter zum Öffnen.'] },
      { tip: 'Ohne Suchbegriff zeigt die Suche die zuletzt bearbeiteten Einträge.' },
    ],
  },
  {
    id: 'notes', title: 'Notizen', summary: 'Editor, Tabs, Ordner, Wiki-Links und Bilder.',
    blocks: [
      { p: 'Notizen öffnen sich direkt im Hauptfenster in Tabs – wie in VS Code oder Obsidian. Die Tabs bleiben auch nach einem Neuladen erhalten. Gespeichert wird automatisch.' },
      { h: 'Markdown ohne Leiste' },
      { table: [['# Überschrift', 'Überschrift (## und ### für kleinere)'], ['**fett**', 'Fett'], ['*kursiv*', 'Kursiv'], ['- Punkt', 'Liste'], ['[ ] Aufgabe', 'Checkliste'], ['> Zitat', 'Zitat'], ['```', 'Codeblock'], ['[[Titel]]', 'Link auf eine andere Notiz']] },
      { h: 'Ordner' },
      { list: ['Links im Explorer liegen Ordner und Notizen als Dateibaum.', 'Notizen und Ordner per Drag & Drop verschieben; beim Ziehen über einen geschlossenen Ordner klappt er auf.', 'Rechtsklick oder „…“ öffnet das Menü: Unterordner, umbenennen, Favorit, anheften, archivieren, löschen.', 'Beim Löschen eines Ordners wandern Inhalte eine Ebene nach oben.'] },
      { h: 'Eigenschaften, Bilder & Anhänge' },
      { list: ['Unter dem Titel setzt du Ordner, Projekt und Tags.', 'Bilder per Einfügen (Strg + V) oder Drag & Drop direkt in den Text – sie werden hochgeladen und eingebettet.', 'Weitere Dateien (PDF, Word, Excel, PowerPoint) unter „Anhänge“.', 'Der Fokus-Modus (Pfeil-Symbol) blendet alles außer dem Text aus; Esc beendet ihn.'] },
      { tip: 'Leere neue Notizen werden beim Schließen des Tabs automatisch verworfen.' },
    ],
  },
  {
    id: 'tasks', title: 'Aufgaben & Kalender', summary: 'Filter, Prioritäten, Termine und Erinnerungen.',
    blocks: [
      { h: 'Aufgaben' },
      { list: ['Farbige Markierung links zeigt die Priorität: Rot hoch, Orange mittel, Blau niedrig.', 'Filter für Status, Priorität, Fälligkeit, Projekt und Tag; Sortierung nach Fälligkeit, Priorität, Datum oder Titel.', 'Die Kacheln oben (Offen, In Arbeit, Überfällig, Erledigt) setzen den passenden Filter.', 'Im Dialog einer Aufgabe: Tags, Anhänge, Verknüpfungen und Archivieren.'] },
      { h: 'Kalender' },
      { list: ['Monats- und Wochenansicht; Doppelklick auf einen Tag legt einen Termin an.', 'Termine und Meetings sind nach Projekt eingefärbt, sonst Blau (Termin) bzw. Violett (Meeting).', 'Filter nach Art und Projekt.'] },
      { h: 'Erinnerungen' },
      { p: 'Erinnerungen werden zur eingestellten Zeit per Telegram geschickt, auf Wunsch wiederkehrend (täglich, werktags, wöchentlich, monatlich).' },
    ],
  },
  {
    id: 'projects', title: 'Projekte', summary: 'Projekte als eigene Workspaces.',
    blocks: [
      { p: 'Jedes Projekt hat eine eigene Seite mit Reitern: Übersicht, Aufgaben, Notizen, Termine, Dokumente, Telegram und Archiv.' },
      { list: ['Die Übersicht zeigt Fortschritt, Kennzahlen, offene Aufgaben, anstehende Termine, letzte Aktivitäten, Anhänge und Verknüpfungen.', 'Notizen, Aufgaben, Termine, Meetings, Dokumente, Ideen und Dateien lassen sich einem Projekt zuordnen.', 'Telegram-Nachrichten mit @Projektname landen automatisch im Projekt.', 'Projekte haben eine feste Farbe, die überall wieder auftaucht (Kalender, Listen, Graph).'] },
    ],
  },
  {
    id: 'knowledge', title: 'Tags, Links & Graph', summary: 'Inhalte vernetzen und Zusammenhänge sehen.',
    blocks: [
      { h: 'Tags' },
      { p: 'Tags sind global: einmal angelegt, stehen sie überall per Autovervollständigung bereit. Jeder Tag hat eine feste Farbe. Unter „Tags“ siehst du alle Tags mit Anzahl, kannst sie umbenennen oder löschen.' },
      { h: 'Verknüpfungen & Backlinks' },
      { list: ['„Verknüpfen“ verbindet zwei beliebige Einträge (Notiz ↔ Aufgabe, Termin ↔ Projekt, …).', 'Ausgehend: worauf der Eintrag verweist. Backlinks: was auf ihn verweist.', 'Verwandt: Einträge im selben Projekt oder mit gemeinsamen Tags.', '[[Titel]] in Notizen und Dokumenten erzeugt automatisch Links.'] },
      { h: 'Graph' },
      { list: ['Zeigt Inhalte als Knoten und Beziehungen als Linien.', 'Typen ein- und ausblenden, Tags als Knoten, Projekt-Zugehörigkeit, unverbundene Einträge.', 'Einfärben nach Typ oder Projekt.', 'Ziehen verschiebt, Mausrad zoomt, Klick hebt Beziehungen hervor, Doppelklick öffnet.'] },
      { tip: 'Bei großen Graphen wird das Layout einmal berechnet und automatisch eingepasst.' },
    ],
  },
  {
    id: 'files', title: 'Dateien & Bilder', summary: 'Hochladen, Vorschau und Einbinden.',
    blocks: [
      { table: [['Bilder', '.png .jpg .jpeg .gif .webp – Vorschau und Galerie'], ['PDF', '.pdf – Vorschau im Browser'], ['Word', '.doc .docx'], ['Excel', '.xls .xlsx'], ['PowerPoint', '.ppt .pptx']] },
      { list: ['Dateien per Button oder Drag & Drop hochladen – im Bereich „Dateien“, „Bilder“ oder als Anhang an Notizen, Aufgaben und Projekten.', '„Dateien“ filtert nach Typ und Projekt, sortiert und zeigt Details mit Vorschau, Beschreibung, Projekt, Tags und Verknüpfungen.', '„Bilder“ ist eine Galerie nach Monaten mit Vollbildansicht (Pfeiltasten blättern).', 'Office-Dateien haben keine Browser-Vorschau, lassen sich aber herunterladen.'] },
      { tip: 'Aus Sicherheitsgründen werden nur diese Formate angenommen; HTML, SVG oder Skripte werden abgelehnt.' },
    ],
  },
  {
    id: 'archive', title: 'Archiv', summary: 'Aufheben statt löschen.',
    blocks: [
      { p: 'Archivierte Einträge verschwinden aus den normalen Ansichten, bleiben aber erhalten. Unter System › Archiv kannst du sie durchsuchen, nach Typ filtern, in der Vorschau ansehen, wiederherstellen oder endgültig löschen.' },
      { list: ['Archivieren über das Archiv-Symbol in Notiz, Aufgabe, Termin, Projekt oder Dokument.', 'Ein archivierter Ordner nimmt seine Notizen und Unterordner mit und bringt sie beim Wiederherstellen zurück.', 'Archivierte Termine lösen keine Telegram-Erinnerungen aus.'] },
    ],
  },
  {
    id: 'database', title: 'Datenbank', summary: 'Der Explorer im Stil von Supabase Studio.',
    blocks: [
      { list: ['Übersicht mit Tabellenanzahl, Datensätzen, Größe, Änderungen und ER-Diagramm.', 'Pro Tabelle: Daten durchsuchen, nach Spalte filtern, per Klick auf die Spaltenköpfe sortieren.', 'Spalten mit Datentyp, Default, Primär- und Fremdschlüsseln, Unique und Index.', 'Beziehungen: was die Tabelle referenziert und wer sie referenziert.'] },
      { tip: 'Der Explorer ist nur lesend. Passwörter und Tokens werden immer ausgeblendet.' },
    ],
  },
  {
    id: 'dashboard', title: 'Dashboard & Statistiken', summary: 'Kennzahlen, Trends und Systemstatus.',
    blocks: [
      { list: ['Fokus-Aufgaben, anstehende Termine und zuletzt bearbeitete Notizen.', 'Kennzahlen zu Notizen, Aufgaben, Terminen, Projekten, Dokumenten und Meetings.', 'Aktivität der letzten 30 Tage: neu, bearbeitet, archiviert, wiederhergestellt, gelöscht.', 'Trend nach Tag, Woche oder Monat und ein Aktivitätskalender für das ganze Jahr.', 'Archivwachstum, API-Aufrufe, Telegram-Nutzung, Datenbankgröße und Synchronisationsstatus.'] },
    ],
  },
  {
    id: 'telegram', title: 'Telegram-Bot', summary: 'Erinnerungen bekommen und Inhalte per Chat erfassen.',
    blocks: [
      { h: 'Einrichten' },
      { steps: ['In Telegram mit @BotFather einen Bot anlegen und den Token kopieren.', 'Einstellungen › Telegram: Token einfügen und speichern.', 'Den angezeigten Link öffnen und im Chat auf „Start“ tippen – damit ist dein Chat verbunden.'] },
      { h: 'Befehle' },
      { table: [['/heute', 'Überblick für heute'], ['/aufgaben', 'Offene Aufgaben'], ['/aufgabe Titel', 'Neue Aufgabe'], ['/notiz Text', 'Neue Notiz (erste Zeile = Titel)'], ['/termin morgen 14:00 Titel', 'Neuer Termin'], ['/erinnerung in 30m Text', 'Neue Erinnerung'], ['/projekt Name', 'Neues Projekt'], ['Text ohne Befehl', 'Wird als Notiz gespeichert']] },
      { list: ['#tag vergibt Tags, @Projekt ordnet einem Projekt zu.', 'Das Telegram-Symbol in der Kopfzeile zeigt den Status, verlinkt den Bot und erlaubt schnelles Senden oder Erfassen.', 'Unter System › Telegram steht der komplette Verlauf.'] },
    ],
  },
  {
    id: 'mcp', title: 'MCP & KI', summary: 'KI-Assistenten Zugriff auf den Workspace geben.',
    blocks: [
      { p: 'Unter /mcp läuft ein MCP-Server (Streamable HTTP). KI-Clients wie Claude können darüber Aufgaben, Notizen, Termine, Tags, Verknüpfungen und mehr lesen und anlegen, E-Mails und Telegram-Nachrichten senden sowie Einträge archivieren.' },
      { list: ['Die Seite „MCP & KI“ zeigt fertige Konfigurationen für Claude Code und Claude Desktop.', 'Der Zugriff ist mit einem Token geschützt (Einstellungen › MCP).', 'Änderungen über MCP erscheinen im Aktivitätsprotokoll mit der Quelle „MCP“.'] },
    ],
  },
  {
    id: 'domain', title: 'Custom Domain & E-Mail', summary: 'Von außen erreichbar machen und Mails senden.',
    blocks: [
      { list: ['Einstellungen › Domain: eigene Domain für Weboberfläche und MCP eintragen, z. B. über einen Reverse Proxy oder Tunnel.', 'Die Prüfung zeigt, ob die Domain auf diesen Rechner zeigt.', 'Von außen sind nur die Weboberfläche (mit Anmeldung) und /mcp (mit Token) erreichbar, die REST-API nur lokal.', 'Einstellungen › E-Mail: SMTP-Server eintragen, dann kann Anamnesies (und MCP) E-Mails versenden.'] },
    ],
  },
  {
    id: 'appearance', title: 'Darstellung', summary: 'Farben, Kanten, Dichte und Theme.',
    blocks: [
      { list: ['Einstellungen › Darstellung: Theme (hell, dunkel, System), Akzentfarbe, Akzent für Buttons.', 'Kantenrundung von eckig bis weich, Dichte Kompakt oder Komfort.', 'Oberflächen „Ebenen“ oder „Flach“ und „Animationen reduzieren“.', 'Diese Einstellungen gelten pro Browser, Sprache und Theme werden im Workspace gespeichert.'] },
    ],
  },
  {
    id: 'advanced', title: 'Erweiterte Features', summary: 'Tastenkürzel, Daten, Testdaten und API.',
    blocks: [
      { h: 'Tastenkürzel' },
      { table: [['Strg + K', 'Globale Suche'], ['Strg + Enter', 'Senden im Telegram-Menü'], ['Esc', 'Dialog, Vorschau oder Fokus-Modus schließen'], ['Mittelklick auf Tab', 'Notiz-Tab schließen']] },
      { h: 'Daten & Leistung' },
      { list: ['Der Browser merkt sich eine Kopie des Workspaces, damit Seiten sofort erscheinen; „Abmelden“ löscht sie.', 'Lange Listen laden schrittweise beim Scrollen.', 'Alle Änderungen landen im Aktivitätsprotokoll (Quelle App, Telegram oder MCP).'] },
      { h: 'Testdaten' },
      { code: 'cd apps/api\npython -m scripts.seed_demo --scale 1' },
      { p: 'Erzeugt hunderte Notizen und Aufgaben, Projekte, Termine, Archiv, Telegram-Verlauf und Statistiken – ohne echte Telegram-Nachrichten auszulösen.' },
      { h: 'REST-API' },
      { p: 'Die API-Dokumentation (OpenAPI) findest du unter http://localhost:8000/docs, wenn die API lokal läuft.' },
    ],
  },
];

const en: DocSection[] = [
  {
    id: 'start', title: 'Welcome', summary: 'What Anamnesies is and how everything fits together.',
    blocks: [
      { p: 'Anamnesies is your personal, locally running workspace for knowledge, projects and organization. Notes, tasks, events, documents and files live in a database on your machine and can be linked freely.' },
      { h: 'Areas' },
      { table: [['Plan', 'Projects, tasks, calendar, reminders, meetings'], ['Knowledge', 'Notes, documents, graph, tags, files, images, lists, ideas'], ['System', 'Archive, database, Telegram, MCP & AI, developer']] },
      { h: 'The idea' },
      { list: ['Everything can have tags – clicking a tag shows all content with it.', 'Everything can belong to a project – the project becomes a workspace.', 'Everything can be linked to everything – backlinks show what points where.', 'Nothing has to be deleted – the archive keeps finished things.'] },
      { tip: 'Ctrl + K (Mac: ⌘ + K) opens the global search anywhere.' },
    ],
  },
  {
    id: 'setup', title: 'Setup', summary: 'Installation, start, accounts and sign-in.',
    blocks: [
      { h: 'Requirements' },
      { list: ['Node.js 20+ and npm', 'Python 3.11+', 'Optional: Docker (for PostgreSQL)'] },
      { h: 'Start' },
      { steps: ['Install dependencies: npm install in the project folder.', 'Set up the API: create a virtual environment in apps/api and run pip install -e .', 'Start the API (port 8000), then the web app (port 3000).', 'Open http://localhost:3000. On the first start you create the admin account; it takes over the existing workspace.'] },
      { code: 'cd apps/api\nuvicorn app.main:app --host 0.0.0.0 --port 8000\n\ncd apps/web\nnpm run dev' },
      { h: 'Configuration' },
      { table: [['AUTH_MODE', 'multi (default): sign-in with username and password, every account has its own workspace · single: no accounts, one local workspace'], ['WORKSPACES_DIR', 'Databases and files of the additional accounts (default: apps/api/data/workspaces)'], ['SESSION_DAYS', 'How long a sign-in stays valid without use (default: 30)'], ['DATABASE_URL', 'e.g. sqlite:///./plm.sqlite3 – otherwise PostgreSQL via POSTGRES_*'], ['UPLOAD_DIR', 'Where files are stored (default: apps/api/data/uploads)'], ['MAX_UPLOAD_MB', 'Maximum file size (default: 25)'], ['SCHEDULER_ENABLED', 'Background services for reminders and Telegram']] },
      { tip: 'Tables and new columns are created automatically when the API starts – no migrations needed.' },
      { h: 'Accounts' },
      { list: ['Admins manage accounts under Settings › Users: create, reset password, disable, delete.', 'Every account has its own workspace: data, files, settings, Telegram bot and MCP token are separate.', 'Under Settings › Account you change your password and sign out single browsers.', 'Forgot the password? On the server: python -m scripts.users password <name> (in apps/api).'] },
    ],
  },
  {
    id: 'navigation', title: 'Navigation & search', summary: 'Sidebar, breadcrumbs and global search.',
    blocks: [
      { p: 'Collapse the sidebar at the top left. The breadcrumbs in the header always show the full path, e.g. Home › Projects › Client A › Meetings › Kickoff – every part is clickable.' },
      { h: 'Global search' },
      { list: ['Ctrl + K or click the search field in the middle of the header.', 'Searches titles and content of notes, tasks, projects, events, meetings, documents, files, ideas and tags.', 'Chips narrow the search to one type; matches are highlighted.', 'Arrow keys to move, Enter to open.'] },
      { tip: 'Without a query, the search shows recently edited entries.' },
    ],
  },
  {
    id: 'notes', title: 'Notes', summary: 'Editor, tabs, folders, wiki links and images.',
    blocks: [
      { p: 'Notes open right in the main window in tabs – like VS Code or Obsidian. Tabs survive a reload, and everything saves automatically.' },
      { h: 'Markdown without a toolbar' },
      { table: [['# Heading', 'Heading (## and ### for smaller)'], ['**bold**', 'Bold'], ['*italic*', 'Italic'], ['- item', 'List'], ['[ ] task', 'Checklist'], ['> quote', 'Quote'], ['```', 'Code block'], ['[[Title]]', 'Link to another note']] },
      { h: 'Folders' },
      { list: ['The explorer on the left shows folders and notes as a file tree.', 'Drag and drop notes and folders; dragging over a closed folder opens it.', 'Right-click or “…” opens the menu: subfolder, rename, favorite, pin, archive, delete.', 'Deleting a folder moves its contents up one level.'] },
      { h: 'Properties, images & attachments' },
      { list: ['Below the title you set folder, project and tags.', 'Paste (Ctrl + V) or drop images straight into the text – they are uploaded and embedded.', 'Other files (PDF, Word, Excel, PowerPoint) go into “Attachments”.', 'Focus mode (arrow icon) hides everything but the text; Esc leaves it.'] },
      { tip: 'Empty new notes are discarded automatically when you close their tab.' },
    ],
  },
  {
    id: 'tasks', title: 'Tasks & calendar', summary: 'Filters, priorities, events and reminders.',
    blocks: [
      { h: 'Tasks' },
      { list: ['The colored mark on the left shows priority: red high, orange medium, blue low.', 'Filter by status, priority, due date, project and tag; sort by due date, priority, date or title.', 'The tiles at the top (open, in progress, overdue, done) set the matching filter.', 'A task’s dialog has tags, attachments, links and archiving.'] },
      { h: 'Calendar' },
      { list: ['Month and week view; double-click a day to add an event.', 'Events and meetings are colored by project, otherwise blue (event) or violet (meeting).', 'Filter by kind and project.'] },
      { h: 'Reminders' },
      { p: 'Reminders are sent via Telegram at the set time, optionally repeating (daily, weekdays, weekly, monthly).' },
    ],
  },
  {
    id: 'projects', title: 'Projects', summary: 'Projects as their own workspaces.',
    blocks: [
      { p: 'Every project has its own page with tabs: overview, tasks, notes, schedule, documents, Telegram and archive.' },
      { list: ['The overview shows progress, key figures, open tasks, upcoming events, recent activity, attachments and links.', 'Notes, tasks, events, meetings, documents, ideas and files can belong to a project.', 'Telegram messages with @ProjectName are filed into the project automatically.', 'Projects have a fixed color that appears everywhere (calendar, lists, graph).'] },
    ],
  },
  {
    id: 'knowledge', title: 'Tags, links & graph', summary: 'Connect content and see how it relates.',
    blocks: [
      { h: 'Tags' },
      { p: 'Tags are global: once created they are suggested everywhere. Every tag has a fixed color. The Tags page lists all tags with counts and lets you rename or delete them.' },
      { h: 'Links & backlinks' },
      { list: ['“Link” connects any two entries (note ↔ task, event ↔ project, …).', 'Outgoing: what an entry points to. Backlinks: what points to it.', 'Related: entries in the same project or with shared tags.', '[[Title]] in notes and documents creates links automatically.'] },
      { h: 'Graph' },
      { list: ['Shows content as nodes and relations as lines.', 'Toggle types, tags as nodes, project membership, unconnected entries.', 'Color by type or project.', 'Drag to pan, scroll to zoom, click to highlight, double-click to open.'] },
      { tip: 'Large graphs are laid out once and fitted to the view automatically.' },
    ],
  },
  {
    id: 'files', title: 'Files & images', summary: 'Upload, preview and attach.',
    blocks: [
      { table: [['Images', '.png .jpg .jpeg .gif .webp – preview and gallery'], ['PDF', '.pdf – in-browser preview'], ['Word', '.doc .docx'], ['Excel', '.xls .xlsx'], ['PowerPoint', '.ppt .pptx']] },
      { list: ['Upload with the button or drag and drop – under Files, Images or as an attachment of notes, tasks and projects.', 'Files filters by type and project, sorts, and shows details with preview, description, project, tags and links.', 'Images is a gallery grouped by month with a full-screen viewer (arrow keys browse).', 'Office files have no browser preview but can be downloaded.'] },
      { tip: 'For security only these formats are accepted; HTML, SVG or scripts are rejected.' },
    ],
  },
  {
    id: 'archive', title: 'Archive', summary: 'Keep instead of delete.',
    blocks: [
      { p: 'Archived entries disappear from the normal views but are kept. Under System › Archive you can search them, filter by type, preview, restore or delete them permanently.' },
      { list: ['Archive with the archive icon in a note, task, event, project or document.', 'An archived folder takes its notes and subfolders along and brings them back on restore.', 'Archived events do not trigger Telegram reminders.'] },
    ],
  },
  {
    id: 'database', title: 'Database', summary: 'An explorer in the style of Supabase Studio.',
    blocks: [
      { list: ['Overview with table count, rows, size, changes and an ER diagram.', 'Per table: search the data, filter by column, sort by clicking column headers.', 'Columns with data type, default, primary and foreign keys, unique and index.', 'Relations: what the table references and who references it.'] },
      { tip: 'The explorer is read-only. Passwords and tokens are always hidden.' },
    ],
  },
  {
    id: 'dashboard', title: 'Dashboard & statistics', summary: 'Key figures, trends and system status.',
    blocks: [
      { list: ['Focus tasks, upcoming events and recently edited notes.', 'Counts of notes, tasks, events, projects, documents and meetings.', 'Activity of the last 30 days: new, edited, archived, restored, deleted.', 'Trend per day, week or month and an activity calendar for the whole year.', 'Archive growth, API calls, Telegram usage, database size and sync status.'] },
    ],
  },
  {
    id: 'telegram', title: 'Telegram bot', summary: 'Get reminders and capture content by chat.',
    blocks: [
      { h: 'Setup' },
      { steps: ['Create a bot with @BotFather in Telegram and copy the token.', 'Settings › Telegram: paste the token and save.', 'Open the link shown and tap “Start” in the chat – your chat is now connected.'] },
      { h: 'Commands' },
      { table: [['/today', 'Overview for today'], ['/tasks', 'Open tasks'], ['/task title', 'New task'], ['/note text', 'New note (first line = title)'], ['/event tomorrow 14:00 title', 'New event'], ['/remind in 30m text', 'New reminder'], ['/project name', 'New project'], ['Text without a command', 'Saved as a note']] },
      { list: ['#tag adds tags, @Project files it into a project.', 'The Telegram icon in the header shows the status, links the bot and lets you send or capture quickly.', 'System › Telegram has the complete history.'] },
    ],
  },
  {
    id: 'mcp', title: 'MCP & AI', summary: 'Give AI assistants access to the workspace.',
    blocks: [
      { p: 'An MCP server (Streamable HTTP) runs at /mcp. AI clients like Claude can read and create tasks, notes, events, tags, links and more, send emails and Telegram messages, and archive entries.' },
      { list: ['The “MCP & AI” page shows ready-made configurations for Claude Code and Claude Desktop.', 'Access is protected by a token (Settings › MCP).', 'Changes made via MCP appear in the activity log with source “MCP”.'] },
    ],
  },
  {
    id: 'domain', title: 'Custom domain & email', summary: 'Reach it from outside and send email.',
    blocks: [
      { list: ['Settings › Domain: enter your own domain for the web app and MCP, e.g. behind a reverse proxy or tunnel.', 'The check shows whether the domain points to this machine.', 'From outside only the web app (with access code) and /mcp (with token) are reachable; the REST API is local only.', 'Settings › Email: enter an SMTP server so Anamnesies (and MCP) can send email.'] },
    ],
  },
  {
    id: 'appearance', title: 'Appearance', summary: 'Colors, corners, density and theme.',
    blocks: [
      { list: ['Settings › Appearance: theme (light, dark, system), accent color, accent buttons.', 'Corner radius from square to soft, density compact or comfortable.', 'Surfaces “layered” or “flat” and “reduce motion”.', 'These settings apply per browser; language and theme are stored in the workspace.'] },
    ],
  },
  {
    id: 'advanced', title: 'Advanced features', summary: 'Shortcuts, data, demo data and API.',
    blocks: [
      { h: 'Shortcuts' },
      { table: [['Ctrl + K', 'Global search'], ['Ctrl + Enter', 'Send in the Telegram menu'], ['Esc', 'Close dialog, preview or focus mode'], ['Middle-click a tab', 'Close a note tab']] },
      { h: 'Data & performance' },
      { list: ['The browser keeps a copy of the workspace so pages appear instantly; “Sign out” removes it.', 'Long lists load progressively while you scroll.', 'Every change is written to the activity log (source app, Telegram or MCP).'] },
      { h: 'Demo data' },
      { code: 'cd apps/api\npython -m scripts.seed_demo --scale 1' },
      { p: 'Creates hundreds of notes and tasks, projects, events, archive entries, Telegram history and statistics – without sending real Telegram messages.' },
      { h: 'REST API' },
      { p: 'The API documentation (OpenAPI) is at http://localhost:8000/docs while the API runs locally.' },
    ],
  },
];

import type { Language } from '@/lib/types';

const translated: Partial<Record<Language, DocSection[]>> = { de, en };

/** The built-in docs exist in German and English; other languages read the English version. */
export function docsFor(language: Language): DocSection[] {
  return translated[language] ?? en;
}
