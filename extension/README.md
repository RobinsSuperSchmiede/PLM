# Anamnesies – Web Notes (Browser-Erweiterung)

Erweiterung für **Chrome** und **Microsoft Edge**, hervorgegangen aus der Sticky-Notes-Erweiterung. Alles wird in der
Datenbank von Anamnesies gespeichert – nicht mehr im Browser.

- **Sticky Notes auf Webseiten** – gleiches Post-it-Design wie bisher: Markdown, Farben, Anpinnen, Minimieren,
  Notizen für eine Seite oder die ganze Website, Drag & Drop, Größe ändern.
- **Websites an Projekte anhängen** – Toolbar-Icon (<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>) → Projekt wählen →
  „An Projekt anhängen". Gespeichert werden URL, Titel, Favicon, eine optionale Notiz und ein Screenshot des sichtbaren
  Bereichs. In Anamnesies erscheint die Seite im Projekt unter **Websites**; der Screenshot liegt zusätzlich bei den
  Dateien des Projekts.
- **Screenshot kopieren** – im Popup, auf der Verwaltungsseite und im Projekt in Anamnesies (als PNG in die Zwischenablage).
- **Verwaltungsseite** – alle Notizen (suchen, filtern, bearbeiten, löschen mit Rückgängig, Export/Import), alle
  angehängten Websites nach Projekt, Verbindungseinstellungen. Gestaltet im Minimal Design System von Anamnesies.

## Installation

1. `chrome://extensions` bzw. `edge://extensions` öffnen, **Entwicklermodus** einschalten.
2. **„Entpackte Erweiterung laden"** → diesen Ordner (`extension/`) wählen.
3. Die Verwaltungsseite öffnet sich bei der Installation auf **Einstellungen**: Server-Adresse (Standard
   `http://localhost:3000`, die Web-App) und den **Token** aus Anamnesies → *Einstellungen → Browser* eintragen →
   „Speichern & testen".

Ohne Konten (`AUTH_MODE=single`) geht es auch ohne Token. Andere Server als `localhost` fragt die Erweiterung beim
Speichern einmal um Erlaubnis.

## Wie es funktioniert

- Die Erweiterung spricht nur mit `/api/v1/browser/*` der Web-App (die Web-App reicht es an das Backend weiter). Der
  Token wird im Header `X-Anamnesies-Token` geschickt und öffnet nur diese Endpunkte, für genau einen Workspace.
- Content Scripts sprechen nie selbst mit dem Server; alle Anfragen laufen über den Service Worker (`background.js`).
- Pro Seite wird immer der ganze Stand gespeichert (Notizen der Seite + Notizen der Website). Gelöscht werden dabei nur
  Notizen, die der Tab kannte – Notizen, die ein anderer Tab inzwischen angelegt hat, bleiben erhalten.
- Daten: Tabellen `web_notes` und `websites` im Workspace; Screenshots als Bilddateien (`files`).

## Alte Notizen übernehmen

In der alten Sticky-Notes-Erweiterung auf der Verwaltungsseite **Export** klicken, hier unter **Notizen → Import** die
JSON-Datei wählen. Notizen mit alten Ids bekommen neue.

## Tastenkürzel

| Aktion | Standard |
| --- | --- |
| Popup (Seite an Projekt anhängen) | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> |
| Neue Notiz | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> |
| Minimieren | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd> |
| Alle ein-/ausblenden | <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>H</kbd> |
| Aufklappen, Anpinnen | frei wählbar unter `…/extensions/shortcuts` |

## Paket bauen

```bash
node extension/scripts/package.mjs   # → extension/dist/anamnesies-web-notes-<version>.zip
```
