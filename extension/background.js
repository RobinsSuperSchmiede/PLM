// Service Worker: Kontextmenü, Tastenkürzel und die Verbindung zur Anamnesies-Datenbank.
// Content Scripts dürfen den lokalen Server nicht selbst ansprechen (CORS / gemischte Inhalte),
// deshalb laufen alle Notiz-Anfragen über diese Datei.

importScripts('api.js');

const MENU_NOTE = 'anamnesies-note';
const MENU_ATTACH = 'anamnesies-attach';

chrome.runtime.onInstalled.addListener((details) => {
  chrome.contextMenus.create({ id: MENU_NOTE, title: 'Sticky Note hier einfügen', contexts: ['page', 'selection', 'image', 'link'] });
  chrome.contextMenus.create({ id: MENU_ATTACH, title: 'Seite an Projekt anhängen …', contexts: ['page'] });
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('manager.html#settings') });
});

// Schickt eine Nachricht an den Tab. Falls dort (noch) kein Content Script läuft
// (z. B. Tab war schon offen, bevor die Erweiterung installiert wurde), wird es nachgeladen.
async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['md.js', 'content.js'] });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (err) {
      console.warn('Anamnesies: Seite unterstützt keine Notizen.', err);
      return null;
    }
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id == null) return;
  if (info.menuItemId === MENU_NOTE) sendToTab(tab.id, { type: 'create', at: 'context', selection: info.selectionText || '' });
  if (info.menuItemId === MENU_ATTACH) chrome.action.openPopup?.().catch(() => {});
});

const COMMANDS = {
  'new-note':       { type: 'create', at: 'center' },
  'minimize-notes': { type: 'minimize' },
  'expand-notes':   { type: 'expand' },
  'toggle-notes':   { type: 'toggleHidden', fromShortcut: true },
  'pin-note':       { type: 'togglePin' }
};

chrome.commands.onCommand.addListener(async (command, tab) => {
  const message = COMMANDS[command];
  if (!message) return;
  const target = tab ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (target?.id != null) sendToTab(target.id, message);
});

// ---------- Datenbank ----------

function originOf(url) {
  try { return new URL(url).origin; } catch (_) { return null; }
}

/** Andere Tabs derselben Website laden ihre Notizen neu (Website-Notizen erscheinen dort auch). */
async function broadcastChange(origin, exceptTabId) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id == null || tab.id === exceptTabId) continue;
    chrome.tabs.sendMessage(tab.id, { type: 'notesChanged', origin }).catch(() => {});
  }
}

const handlers = {
  async 'notes:get'(msg) {
    return { ok: true, notes: await AnamApi.notes.forPage(msg.url) };
  },
  async 'notes:save'(msg, sender) {
    const notes = await AnamApi.notes.save({ url: msg.url, title: msg.title, page: msg.page, site: msg.site, known: msg.known });
    broadcastChange(originOf(msg.url), sender.tab?.id);
    return { ok: true, notes };
  },
  // Verwaltungsseite / Popup haben Notizen geändert -> offene Tabs aktualisieren
  async 'notes:changed'(msg) {
    broadcastChange(msg.origin || null, null);
    return { ok: true };
  }
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg?.type];
  if (!handler) return false;
  handler(msg, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err?.code === 'unauthorized' ? 'not-configured' : String(err?.message || err), code: err?.code }));
  return true; // asynchrone Antwort
});

// Token oder Server geändert -> alle Tabs laden ihre Notizen neu
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && ('token' in changes || 'server' in changes)) broadcastChange(null, null);
});
