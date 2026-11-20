// Verwaltungsseite: alle Sticky Notes, alle an Projekte angehängten Websites und die Verbindung zu
// Anamnesies. Daten kommen aus der Anamnesies-Datenbank (api.js); geöffnete Tabs werden nach
// Änderungen über den Service Worker benachrichtigt.

const { render: renderMarkdown, toggleTask, tiltFor, COLORS } = StickyMD;

const $ = (id) => document.getElementById(id);
const svg = (d, size = 16) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  palette: svg('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/>'),
  open: svg('<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'),
  folder: svg('<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>')
};

const state = {
  tab: 'notes',          // notes | sites | settings
  notes: [],             // Notizen aus der Datenbank (WebNoteRead)
  websites: [],
  projects: [],
  connected: null,
  query: '',
  colors: new Set(),
  pinnedOnly: false,
  siteOnly: false,
  sort: 'updated',
  view: 'grouped',
  editing: null,         // id der Notiz, die gerade bearbeitet wird
  objectUrls: []
};

// ---------- Hilfsfunktionen ----------

const isSiteUrl = (url) => url.endsWith('/*');
const realUrl = (url) => (isSiteUrl(url) ? url.slice(0, -1) : url);
const ts = (iso) => Date.parse(iso) || 0;

function hostOf(url) {
  try { return new URL(realUrl(url)).hostname.replace(/^www\./, ''); } catch (_) { return url; }
}

function prettyUrl(url) {
  if (isSiteUrl(url)) return hostOf(url) + ' · alle Seiten';
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '') + (u.pathname === '/' ? '' : decodeURI(u.pathname)) + u.search;
  } catch (_) { return url; }
}

function faviconUrl(url) {
  return chrome.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(realUrl(url)) + '&size=32';
}

const fmt = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
function relDate(value) {
  const d = new Date(value), now = new Date();
  const days = Math.floor((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (days === 0) return 'Heute, ' + fmtTime.format(d);
  if (days === 1) return 'Gestern, ' + fmtTime.format(d);
  if (days < 7) return `vor ${days} Tagen`;
  return fmt.format(d);
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...children.filter((c) => c != null));
  return e;
}

let toastTimer;
function toast(text, action) {
  const t = $('toast');
  t.replaceChildren(el('span', {}, text));
  if (action) t.append(el('button', { onclick: () => { t.classList.remove('show'); action.run(); } }, action.label));
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), action ? 5000 : 1800);
}

function openUrl(url) {
  chrome.tabs.create({ url: realUrl(url) });
}

async function openApp(path = '/') {
  chrome.tabs.create({ url: await AnamApi.appUrl(path) });
}

/** Offene Tabs aktualisieren ihre Sticky Notes. */
function notifyTabs(url) {
  let origin = null;
  try { origin = new URL(realUrl(url)).origin; } catch (_) {}
  chrome.runtime.sendMessage({ type: 'notes:changed', origin }).catch(() => {});
}

function failed(err) {
  toast(err?.message || String(err));
}

function setConnection(ok, text) {
  state.connected = ok;
  $('conn').className = 'badge ' + (ok ? 'success' : 'danger');
  $('conn-text').textContent = text;
}

// ---------- Daten ----------

async function loadData() {
  try {
    const [status, notes, websites] = await Promise.all([AnamApi.status(), AnamApi.notes.all(), AnamApi.websites.list()]);
    state.projects = status.projects;
    state.notes = notes;
    state.websites = websites;
    setConnection(true, 'Verbunden');
  } catch (err) {
    setConnection(false, err.code === 'unauthorized' ? 'Token fehlt' : 'Offline');
    state.loadError = err;
    return;
  }
  state.loadError = null;
}

/** Notizen gruppiert nach ihrer Seite (bzw. Website bei scope=site). */
function pages() {
  const map = new Map();
  for (const n of state.notes) {
    if (!map.has(n.url)) map.set(n.url, { url: n.url, title: '', notes: [] });
    const page = map.get(n.url);
    page.notes.push(n);
    if (!page.title && n.page_title && n.scope !== 'site') page.title = n.page_title;
  }
  return [...map.values()];
}

async function updateNote(note, patch) {
  try {
    const saved = await AnamApi.notes.update(note.id, patch);
    state.notes = state.notes.map((n) => (n.id === note.id ? saved : n));
    notifyTabs(note.url);
  } catch (err) { failed(err); }
}

// ---------- Filtern & Sortieren ----------

function matches(page, note) {
  if (state.pinnedOnly && !note.pinned) return false;
  if (state.siteOnly && note.scope !== 'site') return false;
  if (state.colors.size && !state.colors.has(note.color || 'yellow')) return false;
  if (!state.query) return true;
  const hay = `${note.text || ''} ${page.url} ${page.title}`.toLowerCase();
  return state.query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function sortNotes(list) {
  const by = {
    updated: (a, b) => ts(b.note.updated_at) - ts(a.note.updated_at),
    created: (a, b) => ts(b.note.created_at) - ts(a.note.created_at),
    oldest: (a, b) => ts(a.note.created_at) - ts(b.note.created_at),
    site: (a, b) => hostOf(a.page.url).localeCompare(hostOf(b.page.url)) || ts(b.note.updated_at) - ts(a.note.updated_at)
  }[state.sort];
  return list.sort(by);
}

// ---------- Rendering ----------

function render() {
  for (const url of state.objectUrls) URL.revokeObjectURL(url);
  state.objectUrls = [];
  for (const name of ['notes', 'sites', 'settings']) {
    const b = $('tab-' + name);
    b.classList.toggle('active', state.tab === name);
    b.setAttribute('aria-selected', String(state.tab === name));
  }
  $('toolbar-notes').hidden = state.tab !== 'notes';
  $('search-wrap').style.visibility = state.tab === 'settings' ? 'hidden' : '';

  const all = pages();
  const sites = new Set(all.map((p) => hostOf(p.url))).size;
  $('count-notes').textContent = state.notes.length || '';
  $('count-sites').textContent = state.websites.length || '';
  $('stats').textContent = state.connected === false
    ? 'Nicht verbunden'
    : `${state.notes.length} ${state.notes.length === 1 ? 'Notiz' : 'Notizen'} auf ${sites} ${sites === 1 ? 'Website' : 'Websites'} · ${state.websites.length} an Projekten`;

  if (state.tab === 'settings') return renderSettings();
  if (state.loadError) return renderOffline();
  if (state.tab === 'sites') return renderWebsites();
  renderNotes(all);
}

function renderOffline() {
  $('main').replaceChildren(el('div', { class: 'empty' },
    el('h2', {}, 'Keine Verbindung zu Anamnesies'),
    el('p', {}, state.loadError.message),
    el('button', { class: 'btn primary', onclick: () => go('settings') }, 'Einstellungen öffnen')));
}

function renderNotes(all) {
  const main = $('main');
  if (!state.notes.length) {
    main.replaceChildren($('empty-template').content.cloneNode(true));
    return;
  }

  const items = [];
  for (const page of all) for (const note of page.notes) if (matches(page, note)) items.push({ page, note });
  sortNotes(items);

  if (!items.length) {
    main.replaceChildren(el('div', { class: 'empty' },
      el('h2', {}, 'Keine Treffer'),
      el('p', {}, 'Für diese Suche bzw. diese Filter gibt es keine Notizen.')));
    return;
  }

  const frag = document.createDocumentFragment();
  if (state.view === 'grouped') {
    const groups = new Map();
    for (const it of items) {
      if (!groups.has(it.page.url)) groups.set(it.page.url, { page: it.page, items: [] });
      groups.get(it.page.url).items.push(it);
    }
    for (const { page, items: list } of groups.values()) frag.append(renderGroup(page, list));
  } else {
    frag.append(el('div', { class: 'grid' }, ...items.map((it) => renderCard(it, true))));
  }
  main.replaceChildren(frag);
}

function groupTitle(page) {
  if (isSiteUrl(page.url)) return 'Ganze Website: ' + hostOf(page.url);
  return page.title || prettyUrl(page.url);
}

function favicon(url) {
  const icon = el('div', { class: 'favicon' });
  const letter = () => { icon.textContent = hostOf(url).charAt(0).toUpperCase() || '•'; };
  if (/^https?:/.test(url)) icon.append(el('img', { src: faviconUrl(url), alt: '', onerror: letter }));
  else letter();
  return icon;
}

function renderGroup(page, list) {
  const total = page.notes.length;
  const countText = list.length === total ? `${total} ${total === 1 ? 'Notiz' : 'Notizen'}` : `${list.length} von ${total}`;

  return el('section', { class: 'group' },
    el('div', { class: 'group-head' },
      favicon(page.url),
      el('div', { class: 'group-title' },
        el('h3', { title: groupTitle(page) }, groupTitle(page)),
        el('a', { href: realUrl(page.url), title: page.url, onclick: (e) => { e.preventDefault(); openUrl(page.url); } }, prettyUrl(page.url))),
      el('span', { class: 'count' }, countText),
      el('div', { class: 'group-actions' },
        el('button', { class: 'icon-btn', title: 'Seite öffnen', html: ICONS.open, onclick: () => openUrl(page.url) }),
        el('button', { class: 'icon-btn danger', title: 'Alle Notizen dieser Seite löschen', html: ICONS.trash, onclick: () => deletePage(page) }))),
    el('div', { class: 'grid' }, ...list.map((it) => renderCard(it, false))));
}

function renderCard({ page, note }, showSite) {
  const c = COLORS[note.color] || COLORS.yellow;
  const card = el('article', { class: 'card', 'data-id': note.id });
  card.style.setProperty('--note-bg', c.bg);
  card.style.setProperty('--tilt', (tiltFor(note.id) * 0.8).toFixed(2) + 'deg');

  card.append(note.pinned ? el('div', { class: 'pinhead', title: 'Auf der Seite angepinnt' }) : el('div', { class: 'tape' }));

  const head = el('div', { class: 'card-head' },
    el('span', { class: 'date', title: 'Erstellt: ' + new Date(note.created_at).toLocaleString('de-DE') }, relDate(note.updated_at || note.created_at)));
  if (note.scope === 'site') head.append(el('span', { class: 'badge site', title: 'Erscheint auf allen Seiten von ' + hostOf(page.url) }, 'Ganze Website'));
  if (note.pinned) head.append(el('span', { class: 'badge' }, 'Angepinnt'));
  if (note.minimized) head.append(el('span', { class: 'badge' }, 'Minimiert'));

  const body = el('div', { class: 'card-body' });
  const hasText = note.text && note.text.trim();
  body.innerHTML = hasText ? renderMarkdown(note.text) : '<p class="placeholder">Leere Notiz</p>';
  body.addEventListener('click', async (e) => {
    const cb = e.target.closest('input[type="checkbox"]');
    if (cb) { await updateNote(note, { text: toggleTask(note.text, +cb.dataset.line) }); render(); }
  });
  body.addEventListener('dblclick', (e) => { if (!e.target.closest('a, input')) startEdit(); });

  const copyBtn = el('button', { class: 'tool', title: 'Text kopieren', html: ICONS.copy });
  copyBtn.addEventListener('click', async () => {
    await navigator.clipboard.writeText(note.text || '');
    copyBtn.innerHTML = ICONS.check;
    copyBtn.classList.add('ok');
    setTimeout(() => { copyBtn.innerHTML = ICONS.copy; copyBtn.classList.remove('ok'); }, 1300);
  });

  const colorBtn = el('button', { class: 'tool', title: 'Farbe ändern', html: ICONS.palette });
  colorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = card.querySelector('.palette');
    document.querySelectorAll('.palette').forEach((p) => p.remove());
    if (open) return;
    card.append(el('div', { class: 'palette' }, ...Object.entries(COLORS).map(([name, col]) => {
      const b = el('button', {
        title: col.name, 'aria-pressed': String(name === (note.color || 'yellow')),
        onclick: async () => { await updateNote(note, { color: name }); render(); }
      });
      b.style.background = col.bg;
      return b;
    })));
  });

  const foot = el('div', { class: 'card-foot' },
    showSite
      ? el('a', { class: 'site', href: realUrl(page.url), title: page.url, onclick: (e) => { e.preventDefault(); openUrl(page.url); } }, prettyUrl(page.url))
      : el('span', { class: 'site' }),
    el('button', { class: 'tool', title: 'Bearbeiten', html: ICONS.edit, onclick: () => startEdit() }),
    copyBtn,
    colorBtn,
    el('button', { class: 'tool', title: 'Seite öffnen', html: ICONS.open, onclick: () => openUrl(page.url) }),
    el('button', { class: 'tool danger', title: 'Löschen', html: ICONS.trash, onclick: () => deleteNotes([note], 'Notiz gelöscht') }));

  card.append(head, body, foot);

  // Kurze Notizen ohne Ausblend-Verlauf
  requestAnimationFrame(() => { if (body.scrollHeight <= body.clientHeight + 2) body.classList.add('short'); });

  function startEdit() {
    if (state.editing && state.editing !== note.id) return;
    state.editing = note.id;
    card.classList.add('editing');
    const ta = el('textarea', { spellcheck: 'false', placeholder: 'Notiz schreiben … (Markdown)' });
    ta.value = note.text || '';
    const save = async () => {
      state.editing = null;
      if (ta.value !== (note.text || '')) await updateNote(note, { text: ta.value });
      render();
    };
    const cancel = () => { state.editing = null; render(); };
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    body.replaceWith(ta);
    foot.replaceChildren(
      el('span', { class: 'site' }, 'Strg+Enter speichert'),
      el('button', { class: 'text-btn', onclick: cancel }, 'Abbrechen'),
      el('button', { class: 'text-btn primary', onclick: save }, 'Speichern'));
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  return card;
}

// ---------- Websites ----------

function websiteMatches(w) {
  if (!state.query) return true;
  const project = state.projects.find((p) => p.id === w.project_id)?.name || '';
  const hay = `${w.title} ${w.url} ${w.description || ''} ${project}`.toLowerCase();
  return state.query.toLowerCase().split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}

function renderWebsites() {
  const main = $('main');
  const list = state.websites.filter(websiteMatches);
  if (!state.websites.length) {
    main.replaceChildren(el('div', { class: 'empty' },
      el('h2', {}, 'Noch keine Websites angehängt'),
      el('p', {}, 'Öffne eine Seite, klicke auf das Toolbar-Icon und hänge sie mit Screenshot an ein Projekt an.')));
    return;
  }
  if (!list.length) {
    main.replaceChildren(el('div', { class: 'empty' }, el('h2', {}, 'Keine Treffer')));
    return;
  }
  const byProject = new Map();
  for (const w of list) {
    const key = w.project_id || '';
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key).push(w);
  }
  const order = [...state.projects.map((p) => p.id), ''].filter((id) => byProject.has(id));
  for (const id of byProject.keys()) if (!order.includes(id)) order.push(id);

  const frag = document.createDocumentFragment();
  for (const id of order) {
    const project = state.projects.find((p) => p.id === id);
    const items = byProject.get(id);
    frag.append(
      el('div', { class: 'project-head' },
        el('span', { class: 'favicon', html: ICONS.folder }),
        el('h3', {}, project ? project.name : 'Ohne Projekt'),
        el('span', { class: 'count' }, `${items.length}`),
        el('span', { class: 'spacer' }),
        project ? el('button', { class: 'btn ghost sm', onclick: () => openApp(`/projects/${id}?tab=websites`) }, 'In Anamnesies öffnen') : null),
      el('div', { class: 'site-grid stagger' }, ...items.map(renderWebsite)));
  }
  main.replaceChildren(frag);
}

function renderWebsite(w) {
  const shot = el('a', { class: 'site-shot', href: w.url, target: '_blank', rel: 'noopener noreferrer' });
  if (w.screenshot_id) {
    const img = el('img', { alt: '', loading: 'lazy' });
    shot.append(img);
    AnamApi.websites.screenshot(w.id, 720).then((blob) => {
      const url = URL.createObjectURL(blob);
      state.objectUrls.push(url);
      img.src = url;
    }).catch(() => shot.replaceChildren(el('span', { class: 'none' }, 'Screenshot nicht verfügbar')));
  } else {
    shot.append(el('span', { class: 'none' }, 'Kein Screenshot'));
  }

  const icon = w.favicon_url ? el('img', { src: w.favicon_url, alt: '', onerror: (e) => { e.target.src = faviconUrl(w.url); } }) : el('img', { src: faviconUrl(w.url), alt: '' });
  const copyShot = w.screenshot_id ? el('button', { class: 'icon-btn', title: 'Screenshot kopieren', html: ICONS.copy }) : null;
  copyShot?.addEventListener('click', () => copyScreenshot(w, copyShot));
  const copyUrl = el('button', { class: 'icon-btn', title: 'URL kopieren', html: ICONS.link });
  copyUrl.addEventListener('click', async () => {
    await navigator.clipboard.writeText(w.url);
    flash(copyUrl, ICONS.link);
    toast('URL kopiert');
  });

  return el('article', { class: 'site-card' },
    shot,
    el('div', { class: 'site-body' },
      el('div', { class: 'site-title' }, icon, el('strong', { title: w.title || w.url }, w.title || hostOf(w.url))),
      el('a', { class: 'site-url', href: w.url, target: '_blank', rel: 'noopener noreferrer', title: w.url }, w.url),
      w.description ? el('p', { class: 'site-desc' }, w.description) : null,
      el('div', { class: 'site-foot' },
        el('span', { class: 'date' }, relDate(w.created_at)),
        copyUrl,
        copyShot,
        el('button', { class: 'icon-btn', title: 'Seite öffnen', html: ICONS.open, onclick: () => openUrl(w.url) }),
        el('button', { class: 'icon-btn danger', title: 'Entfernen', html: ICONS.trash, onclick: () => deleteWebsite(w) }))));
}

function flash(button, icon) {
  button.innerHTML = ICONS.check;
  button.classList.add('ok');
  setTimeout(() => { button.innerHTML = icon; button.classList.remove('ok'); }, 1300);
}

async function toPng(blob) {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return canvas.convertToBlob({ type: 'image/png' });
}

async function copyScreenshot(w, button) {
  try {
    const png = AnamApi.websites.screenshot(w.id).then(toPng);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    flash(button, ICONS.copy);
    toast('Screenshot kopiert');
  } catch (err) {
    toast('Kopieren nicht möglich');
  }
}

async function deleteWebsite(w) {
  if (!confirm(`„${w.title || w.url}" aus dem Projekt entfernen? Der Screenshot wird ebenfalls gelöscht.`)) return;
  try {
    await AnamApi.websites.remove(w.id);
    state.websites = state.websites.filter((x) => x.id !== w.id);
    render();
    toast('Website entfernt');
  } catch (err) { failed(err); }
}

// ---------- Einstellungen ----------

async function renderSettings() {
  $('main').replaceChildren($('settings-template').content.cloneNode(true));
  const config = await AnamApi.getConfig();
  $('server').value = config.server;
  $('token').value = config.token;
  showConnState();
  $('save-settings').addEventListener('click', saveSettings);
  $('open-browser-settings').addEventListener('click', async () => {
    const server = AnamApi.normalizeServer($('server').value);
    chrome.tabs.create({ url: server + '/settings?tab=browser' });
  });
  $('edit-shortcuts').addEventListener('click', () => {
    const edge = navigator.userAgent.includes('Edg/');
    chrome.tabs.create({ url: edge ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts' });
  });
}

function showConnState() {
  const s = $('conn-state');
  if (!s) return;
  if (state.connected) { s.className = 'conn-state ok'; s.textContent = 'Verbunden'; }
  else if (state.loadError) { s.className = 'conn-state err'; s.textContent = state.loadError.message; }
}

async function saveSettings() {
  const server = AnamApi.normalizeServer($('server').value);
  const token = $('token').value.trim();
  // Andere Server als localhost brauchen eine eigene Berechtigung.
  const host = new URL(server).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) {
    const granted = await chrome.permissions.request({ origins: [new URL(server).origin + '/*'] }).catch(() => false);
    if (!granted) { toast('Ohne Berechtigung kann die Erweiterung diesen Server nicht erreichen'); return; }
  }
  await AnamApi.setConfig({ server, token });
  $('conn-state').className = 'conn-state';
  $('conn-state').textContent = 'Teste …';
  await loadData();
  showConnState();
  render();
  if (state.connected) toast('Verbunden mit Anamnesies');
}

// ---------- Aktionen ----------

async function deleteNotes(list, message) {
  try {
    for (const note of list) await AnamApi.notes.remove(note.id);
  } catch (err) { failed(err); }
  const ids = new Set(list.map((n) => n.id));
  state.notes = state.notes.filter((n) => !ids.has(n.id));
  render();
  if (list[0]) notifyTabs(list[0].url);
  toast(message, {
    label: 'Rückgängig',
    run: async () => {
      try {
        const restored = await AnamApi.notes.restore(list.map((n) => ({ ...n, page_title: n.page_title })));
        state.notes = state.notes.concat(restored);
        render();
        if (list[0]) notifyTabs(list[0].url);
      } catch (err) { failed(err); }
    }
  });
}

function deletePage(page) {
  const n = page.notes.length;
  if (!confirm(`Alle ${n} ${n === 1 ? 'Notiz' : 'Notizen'} von „${groupTitle(page)}" löschen?`)) return;
  deleteNotes(page.notes, 'Seite geleert');
}

function exportNotes() {
  const out = {};
  for (const page of pages()) {
    out[page.url] = {
      title: page.title,
      notes: page.notes.map((n) => ({
        id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, text: n.text, color: n.color, minimized: n.minimized, pinned: n.pinned,
        created: ts(n.created_at), updated: ts(n.updated_at)
      }))
    };
  }
  const data = { app: 'anamnesies-web-notes', version: 2, exported: new Date().toISOString(), pages: out };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `anamnesies-web-notes-${new Date().toISOString().slice(0, 10)}.json` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Export erstellt');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Liest Exporte dieser und der alten Sticky-Notes-Erweiterung (chrome.storage-Format). */
async function importNotes(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
    if (!data || typeof data.pages !== 'object') throw new Error('format');
  } catch (_) {
    toast('Datei konnte nicht gelesen werden');
    return;
  }
  const existing = new Set(state.notes.map((n) => n.id));
  const list = [];
  for (const [url, page] of Object.entries(data.pages)) {
    if (!/^(https?|file):/i.test(url) || !Array.isArray(page?.notes)) continue;
    const site = isSiteUrl(url);
    for (const n of page.notes) {
      if (!n || typeof n !== 'object') continue;
      // Alte Notizen haben kurze Ids – sie bekommen eine neue, stabile UUID.
      const id = typeof n.id === 'string' && UUID.test(n.id) ? n.id : null;
      if (id && existing.has(id)) continue;
      list.push({
        id: id || crypto.randomUUID(),
        url, scope: site ? 'site' : 'page', page_title: site ? null : String(page.title || '').slice(0, 200) || null,
        x: Math.round(+n.x || 0), y: Math.round(+n.y || 0), w: Math.max(80, Math.round(+n.w || 240)), h: Math.max(40, Math.round(+n.h || 200)),
        text: String(n.text || ''), color: COLORS[n.color] ? n.color : 'yellow', minimized: !!n.minimized, pinned: !!n.pinned
      });
    }
  }
  if (!list.length) { toast('Keine neuen Notizen gefunden'); return; }
  try {
    const restored = [];
    for (let i = 0; i < list.length; i += 500) restored.push(...(await AnamApi.notes.restore(list.slice(i, i + 500))));
    state.notes = state.notes.concat(restored);
    render();
    chrome.runtime.sendMessage({ type: 'notes:changed', origin: null }).catch(() => {});
    toast(`${restored.length} ${restored.length === 1 ? 'Notiz' : 'Notizen'} importiert`);
  } catch (err) { failed(err); }
}

async function reload() {
  await loadData();
  if (!state.editing) render();
}

function go(tab) {
  state.tab = tab;
  history.replaceState(null, '', tab === 'notes' ? location.pathname : '#' + tab);
  render();
}

// ---------- UI-Verdrahtung ----------

function setupUi() {
  const wrap = $('color-filters');
  for (const [name, c] of Object.entries(COLORS)) {
    const b = el('button', { class: 'swatch-filter', title: c.name, 'aria-pressed': 'false' });
    b.style.background = c.bg;
    b.addEventListener('click', () => {
      state.colors.has(name) ? state.colors.delete(name) : state.colors.add(name);
      b.setAttribute('aria-pressed', String(state.colors.has(name)));
      render();
    });
    wrap.append(b);
  }

  $('tab-notes').addEventListener('click', () => go('notes'));
  $('tab-sites').addEventListener('click', () => go('sites'));
  $('tab-settings').addEventListener('click', () => go('settings'));
  $('open-app').addEventListener('click', () => openApp('/'));

  for (const [id, key] of [['filter-pinned', 'pinnedOnly'], ['filter-site', 'siteOnly']]) {
    $(id).addEventListener('click', (e) => {
      state[key] = !state[key];
      e.currentTarget.setAttribute('aria-pressed', String(state[key]));
      render();
    });
  }

  let searchTimer;
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = e.target.value.trim(); render(); }, 120);
  });

  $('sort').addEventListener('change', (e) => { state.sort = e.target.value; render(); });

  const setView = (v) => {
    state.view = v;
    for (const [id, value] of [['view-grouped', 'grouped'], ['view-flat', 'flat']]) {
      $(id).classList.toggle('active', v === value);
      $(id).setAttribute('aria-pressed', String(v === value));
    }
    render();
  };
  $('view-grouped').addEventListener('click', () => setView('grouped'));
  $('view-flat').addEventListener('click', () => setView('flat'));

  $('export').addEventListener('click', exportNotes);
  $('import').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) importNotes(f);
    e.target.value = '';
  });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
    if (e.key === '/' && !typing && state.tab !== 'settings') { e.preventDefault(); $('search').focus(); }
    if (e.key === 'Escape' && document.activeElement === $('search')) {
      $('search').value = ''; state.query = ''; $('search').blur(); render();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.palette')) document.querySelectorAll('.palette').forEach((p) => p.remove());
  });

  // Änderungen auf Webseiten oder in der Web-App: beim Zurückkehren neu laden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.tab !== 'settings') reload();
  });
  window.addEventListener('hashchange', () => go(['sites', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'notes'));
}

setupUi();
state.tab = ['sites', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'notes';
reload();
