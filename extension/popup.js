// Popup: offene Seite an ein Projekt anhängen (URL + Screenshot) und Sticky Notes der Seite.

const COLORS = Object.fromEntries(Object.entries(StickyMD.COLORS).map(([k, c]) => [k, c.bg]));
const $ = (id) => document.getElementById(id);
const titleOf = (text) => StickyMD.plainTitle(text, 'Leere Notiz');

let tab = null;
let projects = [];
let shotDataUrl = null;
const pageSupported = () => /^(https?|file):/i.test(tab?.url || '');

// ---------- Hilfen ----------

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v != null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...children.filter((c) => c != null));
  return e;
}

function setConnection(state, text) {
  const conn = $('conn');
  conn.className = 'badge ' + (state === 'ok' ? 'ok' : state === 'err' ? 'err' : '');
  $('conn-text').textContent = text;
}

function openManager(hash = '') {
  chrome.tabs.create({ url: chrome.runtime.getURL('manager.html' + hash) });
  window.close();
}

async function dataUrlToBlob(dataUrl) {
  return (await fetch(dataUrl)).blob();
}

/** Für das Hochladen: sehr große PNGs (4K-Bildschirme) werden als JPEG verkleinert. */
async function uploadBlob(dataUrl) {
  const png = await dataUrlToBlob(dataUrl);
  if (png.size < 6 * 1024 * 1024) return { blob: png, name: 'screenshot.png' };
  const bitmap = await createImageBitmap(png);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return { blob: await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 }), name: 'screenshot.jpg' };
}

// ---------- Tabs (Projekt / Notizen) ----------

function showTab(name) {
  const project = name === 'project';
  $('tab-project').classList.toggle('active', project);
  $('tab-notes').classList.toggle('active', !project);
  $('tab-project').setAttribute('aria-selected', String(project));
  $('tab-notes').setAttribute('aria-selected', String(!project));
  $('view-project').hidden = !project;
  $('view-notes').hidden = project;
  chrome.storage.local.set({ popupTab: name });
}

// ---------- Verbindung & Projekte ----------

async function connect() {
  try {
    const status = await AnamApi.status();
    projects = status.projects;
    setConnection('ok', 'Verbunden');
    $('offline').hidden = true;
    return true;
  } catch (err) {
    setConnection('err', err.code === 'unauthorized' ? 'Token fehlt' : 'Offline');
    $('offline-text').textContent = err.message;
    $('offline').hidden = false;
    $('attach').disabled = true;
    return false;
  }
}

async function renderProjects() {
  const select = $('project');
  const { lastProject } = await chrome.storage.local.get('lastProject');
  select.replaceChildren();
  if (!projects.length) {
    select.append(el('option', { value: '' }, 'Noch keine Projekte – in Anamnesies anlegen'));
    select.disabled = true;
    $('attach').disabled = true;
    return;
  }
  const statusLabel = { active: '', on_hold: ' · pausiert', completed: ' · abgeschlossen' };
  for (const p of projects) select.append(el('option', { value: p.id }, (p.pinned ? '★ ' : '') + p.name + (statusLabel[p.status] || '')));
  if (projects.some((p) => p.id === lastProject)) select.value = lastProject;
}

async function renderAttached() {
  if (!pageSupported()) return;
  let list = [];
  try { list = await AnamApi.websites.list(tab.url); } catch (_) { return; }
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const wrap = $('attached-list');
  wrap.replaceChildren();
  const seen = new Set();
  for (const w of list) {
    if (!w.project_id || seen.has(w.project_id)) continue;
    seen.add(w.project_id);
    const href = await AnamApi.appUrl(`/projects/${w.project_id}?tab=websites`);
    wrap.append(el('a', { class: 'badge success', href, target: '_blank', title: 'In Anamnesies öffnen' }, names.get(w.project_id) || 'Projekt'));
  }
  $('attached').hidden = !seen.size;
}

// ---------- Seite & Screenshot ----------

function renderPage() {
  $('page-title').value = (tab.title || '').trim();
  $('page-url').textContent = tab.url || '';
  $('page-url').title = tab.url || '';
  const icon = $('page-icon');
  icon.src = tab.favIconUrl || chrome.runtime.getURL('/_favicon/') + '?pageUrl=' + encodeURIComponent(tab.url || '') + '&size=32';
  icon.onerror = () => { icon.src = 'icons/icon16.png'; icon.onerror = null; };
}

async function capture() {
  const box = $('shot-box');
  try {
    shotDataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    $('shot').src = shotDataUrl;
    box.classList.remove('empty');
    $('copy-shot').disabled = false;
  } catch (err) {
    shotDataUrl = null;
    box.classList.add('empty');
    $('shot-empty').textContent = 'Kein Screenshot möglich (geschützte Seite)';
    $('copy-shot').disabled = true;
    $('with-shot').checked = false;
  }
}

async function copyScreenshot() {
  if (!shotDataUrl) return;
  try {
    const blob = await dataUrlToBlob(shotDataUrl);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Screenshot kopiert');
  } catch (_) {
    toast('Kopieren nicht möglich');
  }
}

async function attach() {
  const projectId = $('project').value;
  if (!projectId) return;
  const button = $('attach');
  const result = $('attach-result');
  button.disabled = true;
  button.textContent = 'Wird angehängt …';
  result.hidden = true;
  try {
    const form = new FormData();
    form.append('url', tab.url);
    form.append('project_id', projectId);
    form.append('title', $('page-title').value.trim() || tab.title || '');
    const description = $('description').value.trim();
    if (description) form.append('description', description);
    if (tab.favIconUrl && /^https?:/i.test(tab.favIconUrl)) form.append('favicon_url', tab.favIconUrl);
    if ($('with-shot').checked && shotDataUrl) {
      const { blob, name } = await uploadBlob(shotDataUrl);
      form.append('screenshot', blob, name);
    }
    const before = new Set((await AnamApi.websites.list(tab.url).catch(() => [])).map((w) => w.id));
    const saved = await AnamApi.websites.attach(form);
    await chrome.storage.local.set({ lastProject: projectId });
    const name = projects.find((p) => p.id === projectId)?.name || 'Projekt';
    const href = await AnamApi.appUrl(`/projects/${projectId}?tab=websites`);
    result.className = 'result';
    result.replaceChildren(before.has(saved.id) ? `In „${name}" aktualisiert · ` : `An „${name}" angehängt · `, el('a', { href, target: '_blank' }, 'Öffnen'));
    result.hidden = false;
    $('description').value = '';
    renderAttached();
  } catch (err) {
    result.className = 'result err';
    result.textContent = err.message;
    result.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = 'An Projekt anhängen';
  }
}

// ---------- Sticky Notes der Seite ----------

// Nachricht an das Content Script; lädt es bei Bedarf nach.
async function send(message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (_) {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['md.js', 'content.js'] });
    return await chrome.tabs.sendMessage(tab.id, message);
  }
}

async function renderNotes() {
  let res;
  try {
    res = await send({ type: 'list' });
  } catch (_) {
    $('unsupported').hidden = false;
    $('new-note').disabled = true;
    $('page-notes').replaceChildren();
    for (const id of ['minimize-all', 'expand-all', 'toggle-hidden', 'delete-all']) $(id).disabled = true;
    return;
  }
  const list = $('page-notes');
  list.replaceChildren();
  $('note-count').textContent = res.notes.length || '';
  $('toggle-hidden').textContent = res.hidden ? 'Einblenden' : 'Ausblenden';
  $('delete-all').hidden = res.notes.length === 0;
  $('minimize-all').disabled = $('expand-all').disabled = res.notes.length === 0;

  if (!res.notes.length) {
    list.append(el('li', { class: 'empty' }, 'Noch keine Notizen auf dieser Seite.'));
    return;
  }
  for (const n of res.notes) {
    const swatch = el('span', { class: 'swatch' });
    swatch.style.background = COLORS[n.color] || COLORS.yellow;
    const marks = [n.scope === 'site' ? 'ganze Website' : null, n.pinned ? 'angepinnt' : null].filter(Boolean).join(' · ');
    const del = el('button', {
      class: 'icon-btn danger', title: 'Löschen', 'aria-label': 'Löschen',
      onclick: async (e) => { e.stopPropagation(); await send({ type: 'delete', id: n.id }); renderNotes(); }
    });
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    list.append(el('li', { onclick: () => { send({ type: 'scrollTo', id: n.id }); window.close(); } },
      swatch, el('span', { class: 'text' }, titleOf(n.text)), marks ? el('span', { class: 'mark' }, marks) : null, del));
  }
}

// ---------- Verdrahtung ----------

$('tab-project').addEventListener('click', () => showTab('project'));
$('tab-notes').addEventListener('click', () => showTab('notes'));
$('open-manager').addEventListener('click', () => openManager());
$('open-settings').addEventListener('click', () => openManager('#settings'));
$('offline-settings').addEventListener('click', () => openManager('#settings'));
$('copy-url').addEventListener('click', async () => {
  await navigator.clipboard.writeText(tab.url);
  toast('URL kopiert');
});
$('recapture').addEventListener('click', capture);
$('copy-shot').addEventListener('click', copyScreenshot);
$('with-shot').addEventListener('change', (e) => $('shot-box').classList.toggle('off', !e.target.checked));
$('attach').addEventListener('click', attach);

$('new-note').addEventListener('click', async () => {
  try {
    await send({ type: 'create', at: 'center' });
    window.close();
  } catch (_) {
    $('unsupported').hidden = false;
  }
});
$('minimize-all').addEventListener('click', () => send({ type: 'minimizeAll' }));
$('expand-all').addEventListener('click', () => send({ type: 'expandAll' }));
$('toggle-hidden').addEventListener('click', async () => { await send({ type: 'toggleHidden' }); renderNotes(); });
$('delete-all').addEventListener('click', async () => {
  if (!confirm('Alle hier sichtbaren Notizen löschen (auch Notizen für die ganze Website)?')) return;
  await send({ type: 'deleteAll' });
  renderNotes();
});
$('edit-shortcuts').addEventListener('click', () => {
  const edge = navigator.userAgent.includes('Edg/');
  chrome.tabs.create({ url: edge ? 'edge://extensions/shortcuts' : 'chrome://extensions/shortcuts' });
});

(async () => {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const { popupTab } = await chrome.storage.local.get('popupTab');
  showTab(popupTab === 'notes' ? 'notes' : 'project');
  renderPage();
  renderNotes();
  if (!pageSupported()) {
    $('attach').disabled = true;
    $('attach-result').textContent = 'Diese Seite kann nicht angehängt werden.';
    $('attach-result').hidden = false;
  }
  capture();
  if (await connect()) {
    await renderProjects();
    renderAttached();
  }
})();
