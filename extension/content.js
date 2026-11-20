// Anamnesies Web Notes – Content Script (Notizen werden in der Anamnesies-Datenbank gespeichert)
// Die Notizen leben in einem Shadow DOM (keine CSS-Konflikte mit der Webseite).
// Normale Notizen kleben in Dokument-Koordinaten (scrollen mit), angepinnte Notizen
// sind am Bildschirm fixiert.
//
// Das Textfeld zum Bearbeiten liegt bewusst im *normalen* DOM und wird per <slot>
// in die Notiz eingeblendet: So ist document.activeElement ein echtes <textarea>,
// und Tastatur-Erweiterungen wie Vimium/Surfingkeys erkennen den Eingabemodus.

(() => {
  if (window.__stickyNotesLoaded) return;
  window.__stickyNotesLoaded = true;

  const { render: renderMarkdown, plainTitle, toggleTask, tiltFor, COLORS } = globalThis.StickyMD;

  const DEFAULT_W = 240;
  const DEFAULT_H = 200;
  const MIN_W = 170;
  const MIN_H = 96;

  const FONT = `-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  const MONO = `ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace`;

  const svg = (d, fill = 'none') =>
    `<svg viewBox="0 0 24 24" width="15" height="15" fill="${fill}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const PIN_PATH = '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>';
  const ICONS = {
    copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
    check: svg('<path d="M20 6 9 17l-5-5"/>'),
    palette: svg('<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1.2" fill="currentColor"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><circle cx="16" cy="10" r="1.2" fill="currentColor"/>'),
    pin: svg(PIN_PATH),
    pinned: svg(PIN_PATH, 'currentColor'),
    globe: svg('<circle cx="12" cy="12" r="9.5"/><path d="M2.5 12h19"/><path d="M12 2.5a14.5 14.5 0 0 1 0 19 14.5 14.5 0 0 1 0-19z"/>'),
    minimize: svg('<path d="M5 12h14"/>'),
    expand: svg('<path d="m6 9 6 6 6-6"/>'),
    close: svg('<path d="M18 6 6 18M6 6l12 12"/>')
  };

  let pageKey = keyFor(location.href);
  let currentUrl = location.href; // URL, unter der die angezeigten Notizen gespeichert werden
  let notes = []; // Notizen dieser Seite (scope 'page') + der ganzen Website (scope 'site')
  let hidden = false;
  let topZ = 1;
  let lastContextPos = null;
  let activeNoteId = null;
  const saveTimers = new Map();
  const views = new Map(); // id -> { el, ta, setMinimized, setPinned, startEdit, stopEdit, place }

  // ---------- Speicher (Anamnesies-Datenbank) ----------
  // Die Notizen liegen in der Datenbank von Anamnesies. Das Content Script spricht nie selbst mit dem
  // Server (CORS, gemischte Inhalte auf https-Seiten), sondern schickt alles an den Service Worker.
  // Gespeichert wird immer der ganze Stand der Seite: Notizen dieser URL + Notizen der ganzen Website.
  // `known` enthält nur Notizen, die dieser Tab kennt – Notizen, die ein anderer Tab inzwischen angelegt
  // hat, werden so nie versehentlich gelöscht.

  function keyFor(href) {
    const u = new URL(href);
    return u.origin + u.pathname + u.search; // #hash wird ignoriert
  }

  const known = new Set();
  let loaded = false;
  let offlineShown = false;
  let saveChain = Promise.resolve();

  const ofScope = (scope) => notes.filter((n) => (n.scope || 'page') === scope);

  const fromServer = (n) => ({
    id: n.id, x: n.x, y: n.y, w: n.w, h: n.h, text: n.text || '', color: n.color || 'yellow',
    minimized: !!n.minimized, pinned: !!n.pinned, scope: n.scope === 'site' ? 'site' : 'page',
    project_id: n.project_id || null, created: Date.parse(n.created_at) || Date.now(), updated: Date.parse(n.updated_at) || Date.now()
  });

  function call(message) {
    return chrome.runtime.sendMessage(message).catch((err) => ({ ok: false, error: String(err?.message || err) }));
  }

  function reportOffline(res) {
    if (res?.ok || offlineShown) return;
    offlineShown = true;
    toast(res?.error === 'not-configured'
      ? 'Anamnesies: Erweiterung noch nicht verbunden (Einstellungen)'
      : 'Anamnesies nicht erreichbar – Notizen werden nicht gespeichert');
  }

  async function load() {
    const url = location.href;
    const res = await call({ type: 'notes:get', url });
    if (url !== location.href) return; // inzwischen weiternavigiert
    if (!res?.ok) { reportOffline(res); return; }
    offlineShown = false;
    loaded = true;
    notes = res.notes.map(fromServer);
    known.clear();
    for (const n of notes) known.add(n.id);
    renderAll();
  }

  function serialize(list) {
    return list.map(({ id, x, y, w, h, text, color, minimized, pinned, project_id }) =>
      ({ id, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), text: text || '', color, minimized: !!minimized, pinned: !!pinned, project_id: project_id || null }));
  }

  function persist() {
    const payload = {
      type: 'notes:save',
      url: currentUrl,
      title: (document.title || '').trim().slice(0, 200),
      page: serialize(ofScope('page')),
      site: serialize(ofScope('site')),
      known: [...known]
    };
    for (const n of notes) known.add(n.id);
    saveChain = saveChain.then(async () => {
      const res = await call(payload);
      if (!res?.ok) { reportOffline(res); return; }
      offlineShown = false;
      if (!loaded && payload.url === currentUrl) {
        // Erste Verbindung nach einem Fehler: Notizen vom Server ergänzen, die hier noch fehlen.
        loaded = true;
        const ids = new Set(notes.map((n) => n.id));
        const extra = res.notes.filter((n) => !ids.has(n.id)).map(fromServer);
        if (extra.length) {
          for (const n of extra) known.add(n.id);
          notes = notes.concat(extra);
          renderAll();
        }
      }
    });
    return saveChain;
  }

  function persistDebounced(id, delay = 500) {
    clearTimeout(saveTimers.get(id));
    saveTimers.set(id, setTimeout(() => { saveTimers.delete(id); persist(); }, delay));
  }

  const anyEditing = () => [...views.values()].some((v) => v.isEditing());

  // Änderungen aus anderen Tabs, der Verwaltungsseite oder der Web-App übernehmen
  function refreshFromServer() {
    if (anyEditing() || saveTimers.size) return;
    saveChain.then(load);
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshFromServer();
  });

  // ---------- Shadow-DOM-Host ----------

  const host = document.createElement('sticky-notes-root');
  const hostStyle = {
    position: 'absolute', top: '0', left: '0', width: '0', height: '0',
    overflow: 'visible', 'z-index': '2147483647', margin: '0', padding: '0',
    border: '0', display: 'block', 'pointer-events': 'none', transform: 'none', filter: 'none'
  };
  for (const [k, v] of Object.entries(hostStyle)) host.style.setProperty(k, v, 'important');
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .layer { position: absolute; top: 0; left: 0; width: 0; height: 0; }
      .layer.hidden { display: none; }

      .note {
        --tilt: 0deg;
        position: absolute;
        display: flex; flex-direction: column;
        border-radius: 3px 3px 6px 6px;
        background:
          linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,0) 40%, rgba(0,0,0,.035)),
          var(--bg);
        box-shadow:
          0 1px 1px rgba(0,0,0,.08),
          0 4px 6px -2px rgba(0,0,0,.10),
          0 14px 22px -10px rgba(0,0,0,.38);
        transform: rotate(var(--tilt));
        transform-origin: 50% 0;
        pointer-events: auto;
        font: 14px/1.55 ${FONT};
        color: #1f2328;
        -webkit-font-smoothing: antialiased;
        animation: pop .18s ease-out;
        transition: transform .18s ease, box-shadow .18s ease;
      }
      @keyframes pop { from { transform: rotate(var(--tilt)) scale(.92); opacity: 0; } }
      .note.pinned { position: fixed; }
      .note.editing, .note:focus-within { transform: rotate(0deg); }
      .note.dragging {
        transform: rotate(0deg) scale(1.025);
        box-shadow: 0 2px 2px rgba(0,0,0,.06), 0 24px 40px -12px rgba(0,0,0,.45);
        transition: none; cursor: grabbing;
      }
      .note.minimized { height: auto !important; }
      .note.minimized .body, .note.minimized .foot, .note.minimized .grip { display: none; }

      /* Klebestreifen */
      .tape {
        position: absolute; top: -11px; left: 50%; width: 84px; height: 24px;
        transform: translateX(-50%) rotate(calc(-2deg - var(--tilt)));
        background: linear-gradient(180deg, rgba(252,252,248,.82), rgba(232,231,222,.74));
        box-shadow: 0 1px 3px rgba(0,0,0,.18), inset 0 0 0 1px rgba(255,255,255,.35);
        clip-path: polygon(3% 0, 97% 0, 100% 18%, 97% 36%, 100% 55%, 97% 74%, 100% 100%, 3% 100%, 0 82%, 3% 64%, 0 45%, 3% 26%, 0 8%);
        pointer-events: none; z-index: 3;
      }
      /* Pinnnadel (bei angepinnten Notizen statt Klebestreifen) */
      .pin {
        display: none; position: absolute; top: -9px; left: 50%; width: 18px; height: 18px;
        transform: translateX(-50%); border-radius: 50%; z-index: 3; pointer-events: none;
        background: radial-gradient(circle at 35% 30%, #ff8a80 0 18%, #e53935 45%, #a31515 100%);
        box-shadow: 0 3px 4px -1px rgba(0,0,0,.45), 2px 6px 6px -3px rgba(0,0,0,.25);
      }
      .note.pinned .tape { display: none; }
      .note.pinned .pin { display: block; }

      .head {
        display: flex; align-items: center; gap: 1px;
        height: 34px; padding: 4px 4px 0 10px; flex: 0 0 auto;
        border-radius: 3px 3px 0 0;
        background: linear-gradient(180deg, var(--head), color-mix(in srgb, var(--head) 70%, var(--bg)));
        cursor: grab; user-select: none; touch-action: none;
      }
      .title {
        flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
        font-size: 13px; font-weight: 600; color: rgba(0,0,0,.72);
      }
      .btn {
        all: unset; cursor: pointer; width: 26px; height: 26px; border-radius: 6px;
        display: grid; place-items: center; color: rgba(0,0,0,.55);
        transition: background .12s, color .12s, opacity .12s;
      }
      .btn:hover { background: rgba(0,0,0,.08); color: rgba(0,0,0,.9); }
      .btn:focus-visible { outline: 2px solid rgba(0,0,0,.4); }
      .btn.del:hover { background: #e5484d; color: #fff; }
      .btn.ok { color: #1a7f37; }
      .btn.pin-btn.on { color: #c62828; }
      .btn.site-btn.on { color: #0b57d0; }
      .btn.hover-only { opacity: 0; }
      .note:hover .btn.hover-only, .note.editing .btn.hover-only, .note.minimized .btn.hover-only,
      .btn.pin-btn.on, .btn.site-btn.on { opacity: 1; }

      .palette {
        position: absolute; top: 38px; right: 8px; z-index: 5;
        display: none; gap: 6px; padding: 7px; border-radius: 10px;
        background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,.06), 0 8px 20px rgba(0,0,0,.18);
      }
      .palette.open { display: flex; }
      .swatch {
        all: unset; width: 18px; height: 18px; border-radius: 50%; cursor: pointer;
        box-shadow: inset 0 0 0 1px rgba(0,0,0,.18); transition: transform .1s;
      }
      .swatch:hover { transform: scale(1.15); }
      .swatch.active { box-shadow: inset 0 0 0 1px rgba(0,0,0,.18), 0 0 0 2px #fff, 0 0 0 4px #1f2328; }

      .body { position: relative; flex: 1; display: flex; min-height: 0; overflow: hidden; }
      .md { flex: 1; padding: 8px 12px 4px; overflow-y: auto; overflow-wrap: anywhere; cursor: text; }
      slot { display: none; }
      .note.editing slot { display: flex; flex: 1; min-height: 0; }
      .note.editing .md { display: none; }

      .md > :first-child { margin-top: 0; }
      .md > :last-child { margin-bottom: 0; }
      .md p { margin: 0 0 .55em; }
      .md h1, .md h2, .md h3 { margin: .2em 0 .35em; line-height: 1.3; font-weight: 700; }
      .md h1 { font-size: 1.3em; }
      .md h2 { font-size: 1.15em; }
      .md h3 { font-size: 1em; }
      .md ul, .md ol { margin: 0 0 .55em; padding-left: 1.3em; }
      .md li { margin: .1em 0; }
      .md li.task { list-style: none; margin-left: -1.3em; display: flex; gap: .45em; align-items: baseline; }
      .md li.task input { margin: 0; transform: translateY(2px); cursor: pointer; accent-color: #1f2328; }
      .md li.task.done > span { color: rgba(0,0,0,.45); text-decoration: line-through; }
      .md a { color: #0b57d0; text-decoration: underline; text-underline-offset: 2px; }
      .md code { font: .88em ${MONO}; background: rgba(0,0,0,.07); padding: .1em .35em; border-radius: 4px; }
      .md pre { margin: 0 0 .55em; padding: 8px 10px; border-radius: 6px; background: rgba(0,0,0,.07); overflow-x: auto; white-space: pre; }
      .md pre code { background: none; padding: 0; font-size: .85em; }
      .md blockquote { margin: 0 0 .55em; padding: .1em 0 .1em .8em; border-left: 3px solid rgba(0,0,0,.2); color: rgba(0,0,0,.65); }
      .md hr { border: 0; border-top: 1px solid rgba(0,0,0,.15); margin: .7em 0; }
      .md mark { background: rgba(255,214,0,.55); padding: 0 .15em; border-radius: 2px; }
      .md .placeholder { color: rgba(0,0,0,.38); }

      .foot {
        flex: 0 0 auto; display: flex; justify-content: space-between; gap: 8px;
        padding: 2px 22px 7px 12px; font: 11px/1.4 ${FONT}; color: rgba(0,0,0,.4);
      }
      .foot .hint, .foot .scope { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .foot .hint { display: none; }
      .note.editing .foot .hint { display: inline; }
      .note.editing .foot .scope { display: none; }
      .foot .scope { color: #0b57d0; opacity: .75; }

      /* Eigener Resize-Griff (CSS resize würde overflow:hidden erzwingen) */
      .grip {
        position: absolute; right: 0; bottom: 0; width: 18px; height: 18px; cursor: nwse-resize;
        touch-action: none; border-radius: 0 0 6px 0;
        background: linear-gradient(135deg, transparent 0 50%, rgba(0,0,0,.10) 50% 58%, transparent 58% 68%, rgba(0,0,0,.10) 68% 76%, transparent 76%);
        opacity: 0; transition: opacity .12s;
      }
      .note:hover .grip { opacity: 1; }

      .note.flash { animation: flash .9s ease-in-out 2; }
      @keyframes flash { 50% { box-shadow: 0 0 0 4px #f59e0b, 0 14px 22px -10px rgba(0,0,0,.38); } }

      .toast {
        position: fixed; left: 50%; bottom: 24px; transform: translate(-50%, 12px);
        padding: 8px 14px; border-radius: 8px; background: #1f2328; color: #fff;
        font: 13px/1.4 ${FONT}; box-shadow: 0 8px 24px rgba(0,0,0,.25);
        opacity: 0; transition: opacity .18s, transform .18s; pointer-events: none;
      }
      .toast.show { opacity: 1; transform: translate(-50%, 0); }
    </style>
    <div class="layer"></div>
    <div class="toast"></div>
  `;
  const layer = shadow.querySelector('.layer');
  const toastEl = shadow.querySelector('.toast');
  let toastTimer;

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  function mountHost() {
    if (!host.isConnected) document.documentElement.appendChild(host);
  }
  mountHost();

  // Light-DOM-Textfeld: Inline-Styles mit !important schützen vor Seiten-CSS
  const EDITOR_STYLE = {
    all: 'unset',
    display: 'block', flex: '1 1 auto', 'box-sizing': 'border-box',
    width: '100%', height: '100%', 'min-height': '0', margin: '0',
    padding: '8px 12px 4px', border: '0', outline: 'none', 'box-shadow': 'none',
    background: 'transparent', color: '#1f2328', 'caret-color': '#1f2328',
    font: `13.5px/1.55 ${MONO}`, 'letter-spacing': 'normal', 'text-transform': 'none',
    'text-align': 'left', 'white-space': 'pre-wrap', 'overflow-wrap': 'anywhere',
    'overflow-y': 'auto', resize: 'none', cursor: 'text', 'pointer-events': 'auto',
    visibility: 'visible', opacity: '1'
  };
  function createEditor(slotName) {
    const ta = document.createElement('textarea');
    ta.setAttribute('slot', slotName);
    ta.setAttribute('spellcheck', 'false');
    ta.setAttribute('aria-label', 'Sticky Note bearbeiten');
    ta.placeholder = 'Notiz schreiben … (Markdown)';
    for (const [k, v] of Object.entries(EDITOR_STYLE)) ta.style.setProperty(k, v, 'important');
    host.appendChild(ta);
    return ta;
  }

  // ---------- Rendering ----------

  function renderAll() {
    layer.innerHTML = '';
    host.replaceChildren(); // Light-DOM-Textfelder entfernen
    views.clear();
    for (const n of notes) layer.appendChild(buildNote(n));
  }

  function formatDate(ts) {
    return new Date(ts).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  }

  function applyColor(el, color) {
    const c = COLORS[color] || COLORS.yellow;
    el.style.setProperty('--bg', c.bg);
    el.style.setProperty('--head', c.head);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const t = document.createElement('textarea');
      t.value = text;
      t.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
      shadow.appendChild(t);
      t.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { /* ignore */ }
      t.remove();
      return ok;
    }
  }

  const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

  function buildNote(n) {
    const el = document.createElement('div');
    el.className = 'note';
    el.dataset.id = n.id;
    el.style.setProperty('--tilt', tiltFor(n.id) + 'deg');
    el.style.zIndex = ++topZ;
    applyColor(el, n.color);

    const slotName = 'sn-' + n.id;
    el.innerHTML = `
      <div class="tape"></div>
      <div class="pin"></div>
      <div class="head">
        <span class="title"></span>
        <button class="btn hover-only site-btn"></button>
        <button class="btn hover-only pin-btn"></button>
        <button class="btn hover-only color" title="Farbe ändern">${ICONS.palette}</button>
        <button class="btn hover-only min"></button>
        <button class="btn hover-only del" title="Notiz löschen">${ICONS.close}</button>
        <button class="btn copy" title="Text kopieren">${ICONS.copy}</button>
      </div>
      <div class="palette"></div>
      <div class="body">
        <div class="md"></div>
        <slot name="${slotName}"></slot>
      </div>
      <div class="foot"><span class="hint">Esc / Strg+Enter: fertig</span><span class="scope"></span><span class="date"></span></div>
      <div class="grip" title="Größe ändern"></div>
    `;

    const head = el.querySelector('.head');
    const title = el.querySelector('.title');
    const md = el.querySelector('.md');
    const date = el.querySelector('.date');
    const palette = el.querySelector('.palette');
    const minBtn = el.querySelector('.min');
    const pinBtn = el.querySelector('.pin-btn');
    const siteBtn = el.querySelector('.site-btn');
    const scopeLabel = el.querySelector('.scope');
    const copyBtn = el.querySelector('.copy');
    const grip = el.querySelector('.grip');
    const ta = createEditor(slotName);

    // Position & Größe anwenden (angepinnte Notizen bleiben im sichtbaren Bereich)
    function place() {
      el.classList.toggle('pinned', !!n.pinned);
      el.classList.toggle('minimized', !!n.minimized);
      const w = n.w || DEFAULT_W;
      let x = n.x, y = n.y;
      if (n.pinned) {
        x = clamp(x, 0, window.innerWidth - Math.min(w, 120));
        y = clamp(y, 0, window.innerHeight - 40);
      }
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.width = w + 'px';
      el.style.height = n.minimized ? '' : (n.h || DEFAULT_H) + 'px';
    }

    const renderMd = () => {
      md.innerHTML = n.text && n.text.trim()
        ? renderMarkdown(n.text)
        : '<p class="placeholder">Klicken zum Schreiben …</p>';
    };
    const refreshMeta = () => {
      title.textContent = plainTitle(n.text);
      title.style.visibility = n.minimized ? 'visible' : 'hidden';
      date.textContent = formatDate(n.updated || n.created);
      minBtn.innerHTML = n.minimized ? ICONS.expand : ICONS.minimize;
      minBtn.title = n.minimized ? 'Aufklappen (Alt+Shift+O)' : 'Minimieren (Alt+Shift+M)';
      pinBtn.innerHTML = n.pinned ? ICONS.pinned : ICONS.pin;
      pinBtn.classList.toggle('on', !!n.pinned);
      const site = n.scope === 'site';
      siteBtn.innerHTML = ICONS.globe;
      siteBtn.classList.toggle('on', site);
      siteBtn.title = site
        ? `Auf allen Seiten von ${location.hostname} sichtbar – klicken für nur diese Seite`
        : `Auf allen Seiten von ${location.hostname} anzeigen`;
      scopeLabel.textContent = site ? 'Ganze Website · ' + location.hostname : '';
      pinBtn.title = n.pinned ? 'Lösen (scrollt wieder mit der Seite)' : 'Anpinnen (bleibt beim Scrollen sichtbar)';
    };
    place();
    renderMd();
    refreshMeta();

    const onInput = () => {
      n.text = ta.value;
      n.updated = Date.now();
      date.textContent = formatDate(n.updated);
      persistDebounced(n.id);
    };

    // ----- Bearbeiten / Ansehen -----

    const isEditing = () => el.classList.contains('editing');

    function startEdit() {
      for (const [id, v] of views) if (id !== n.id) v.stopEdit();
      if (n.minimized) setMinimized(false);
      palette.classList.remove('open');
      el.classList.add('editing');
      ta.value = n.text || '';
      ta.focus({ preventScroll: true });
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }

    function stopEdit() {
      if (!isEditing()) return;
      el.classList.remove('editing');
      if (document.activeElement === ta) ta.blur();
      renderMd();
      refreshMeta();
      if (saveTimers.has(n.id)) {
        clearTimeout(saveTimers.get(n.id));
        saveTimers.delete(n.id);
        persist();
      }
    }

    ta.addEventListener('input', onInput);
    ta.addEventListener('blur', stopEdit);

    md.addEventListener('click', (e) => {
      const cb = e.target.closest('input[type="checkbox"]');
      if (cb) {
        n.text = toggleTask(n.text, +cb.dataset.line);
        n.updated = Date.now();
        renderMd(); refreshMeta(); persist();
        return;
      }
      if (e.target.closest('a')) return;
      const sel = (shadow.getSelection ? shadow.getSelection() : window.getSelection())?.toString();
      if (sel) return; // Text wird gerade markiert
      startEdit();
    });

    // Markdown-Helfer im Editor
    function wrap(before, after = before, fallback = 'Text') {
      const { selectionStart: s, selectionEnd: e, value } = ta;
      const sel = value.slice(s, e) || fallback;
      ta.setRangeText(before + sel + after, s, e, 'end');
      ta.setSelectionRange(s + before.length, s + before.length + sel.length);
      onInput();
    }

    ta.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'Escape' || (mod && e.key === 'Enter')) {
        e.preventDefault();
        stopEdit();
        return;
      }
      if (mod && !e.shiftKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'b') { e.preventDefault(); wrap('**'); return; }
        if (k === 'i') { e.preventDefault(); wrap('*'); return; }
        if (k === 'k') { e.preventDefault(); wrap('[', '](https://)', 'Link'); return; }
      }
      // Listen automatisch fortsetzen
      if (e.key === 'Enter' && !mod && !e.shiftKey && !e.altKey && ta.selectionStart === ta.selectionEnd) {
        const v = ta.value, pos = ta.selectionStart;
        const ls = v.lastIndexOf('\n', pos - 1) + 1;
        const line = v.slice(ls, pos);
        const m = line.match(/^(\s*)([-*+]|(\d+)([.)]))\s+(\[[ xX]\]\s+)?/);
        if (!m) return;
        e.preventDefault();
        if (line === m[0]) {
          ta.setRangeText('', ls, pos, 'end'); // leerer Punkt -> Liste beenden
        } else {
          const marker = m[3] != null ? `${+m[3] + 1}${m[4]}` : m[2];
          ta.setRangeText('\n' + m[1] + marker + ' ' + (m[5] ? '[ ] ' : ''), pos, pos, 'end');
        }
        onInput();
      }
      // Tab rückt Zeilen ein
      if (e.key === 'Tab') {
        e.preventDefault();
        const pos = ta.selectionStart;
        const ls = ta.value.lastIndexOf('\n', pos - 1) + 1;
        if (e.shiftKey) {
          if (ta.value.startsWith('  ', ls)) ta.setRangeText('', ls, ls + 2, 'preserve');
          ta.setSelectionRange(Math.max(ls, pos - 2), Math.max(ls, pos - 2));
        } else {
          ta.setRangeText('  ', ls, ls, 'preserve');
          ta.setSelectionRange(pos + 2, pos + 2);
        }
        onInput();
      }
    });

    // Tastatureingaben nicht an Shortcuts der Webseite weiterreichen (YouTube, GitHub, …)
    for (const type of ['keydown', 'keyup', 'keypress']) {
      el.addEventListener(type, (e) => e.stopPropagation());
    }

    // Nach vorne holen + als aktive Notiz merken
    el.addEventListener('pointerdown', () => { el.style.zIndex = ++topZ; activeNoteId = n.id; }, true);
    el.addEventListener('focusin', () => { activeNoteId = n.id; });

    // ----- Ziehen (Kopf) und Größe ändern (Griff) -----
    function dragHandler(target, onMove, onEnd) {
      target.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.btn')) return;
        e.preventDefault();
        target.setPointerCapture(e.pointerId);
        const start = { x: e.clientX, y: e.clientY, nx: n.x, ny: n.y, w: el.offsetWidth, h: el.offsetHeight };
        const move = (ev) => onMove(ev.clientX - start.x, ev.clientY - start.y, start);
        const up = () => {
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', up);
          target.removeEventListener('pointercancel', up);
          onEnd(start);
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
      });
    }

    dragHandler(head, (dx, dy, s) => {
      el.classList.add('dragging');
      n.x = Math.max(0, s.nx + dx);
      n.y = Math.max(0, s.ny + dy);
      if (n.pinned) {
        n.x = clamp(n.x, 0, window.innerWidth - 60);
        n.y = clamp(n.y, 0, window.innerHeight - 34);
      }
      el.style.left = n.x + 'px';
      el.style.top = n.y + 'px';
    }, (s) => {
      el.classList.remove('dragging');
      if (n.x !== s.nx || n.y !== s.ny) persist();
    });

    dragHandler(grip, (dx, dy, s) => {
      n.w = Math.round(Math.max(MIN_W, s.w + dx));
      n.h = Math.round(Math.max(MIN_H, s.h + dy));
      el.style.width = n.w + 'px';
      el.style.height = n.h + 'px';
    }, (s) => {
      if (n.w !== s.w || n.h !== s.h) persist();
    });

    head.addEventListener('dblclick', (e) => {
      if (!e.target.closest('.btn')) { setMinimized(!n.minimized); persist(); }
    });

    // ----- Farbpalette -----
    for (const [name, c] of Object.entries(COLORS)) {
      const sw = document.createElement('button');
      sw.className = 'swatch' + (name === (n.color || 'yellow') ? ' active' : '');
      sw.style.background = c.bg;
      sw.title = c.name;
      sw.addEventListener('click', () => {
        n.color = name;
        applyColor(el, name);
        palette.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('active', s === sw));
        palette.classList.remove('open');
        persist();
      });
      palette.appendChild(sw);
    }
    el.querySelector('.color').addEventListener('click', () => palette.classList.toggle('open'));

    // ----- Minimieren -----
    function setMinimized(value) {
      if (!!n.minimized === value) return false;
      if (value) stopEdit();
      n.minimized = value;
      palette.classList.remove('open');
      place();
      refreshMeta();
      return true;
    }
    minBtn.addEventListener('click', () => { setMinimized(!n.minimized); persist(); });

    // ----- Anpinnen: Dokument- <-> Bildschirm-Koordinaten umrechnen -----
    function setPinned(value) {
      if (!!n.pinned === value) return false;
      const rect = el.getBoundingClientRect();
      const left = parseFloat(el.style.left) || 0;
      const top = parseFloat(el.style.top) || 0;
      if (value) {
        n.x = Math.round(left - window.scrollX);
        n.y = Math.round(top - window.scrollY);
        // War die Notiz gar nicht sichtbar? Dann oben rechts einblenden.
        if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
          n.x = Math.max(16, window.innerWidth - (n.w || DEFAULT_W) - 24);
          n.y = 24;
        }
      } else {
        n.x = Math.round(left + window.scrollX);
        n.y = Math.round(top + window.scrollY);
      }
      n.pinned = value;
      place();
      refreshMeta();
      return true;
    }
    pinBtn.addEventListener('click', () => {
      setPinned(!n.pinned);
      persist();
      toast(n.pinned ? 'Angepinnt – bleibt beim Scrollen sichtbar' : 'Gelöst – klebt wieder an der Seite');
    });

    // ----- Sichtbarkeit: nur diese Seite <-> ganze Website -----
    siteBtn.addEventListener('click', () => {
      n.scope = n.scope === 'site' ? 'page' : 'site';
      refreshMeta();
      persist();
      toast(n.scope === 'site'
        ? `Sichtbar auf allen Seiten von ${location.hostname}`
        : 'Nur noch auf dieser Seite sichtbar');
    });

    // ----- Kopieren -----
    let copyTimer;
    copyBtn.addEventListener('click', async () => {
      const ok = await copyText(n.text || '');
      copyBtn.innerHTML = ok ? ICONS.check : ICONS.close;
      copyBtn.classList.toggle('ok', ok);
      copyBtn.title = ok ? 'Kopiert!' : 'Kopieren fehlgeschlagen';
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copyBtn.innerHTML = ICONS.copy;
        copyBtn.classList.remove('ok');
        copyBtn.title = 'Text kopieren';
      }, 1400);
    });

    // ----- Löschen -----
    el.querySelector('.del').addEventListener('click', () => {
      if (n.text && n.text.trim() && !confirm('Diese Notiz wirklich löschen?')) return;
      deleteNote(n.id);
    });

    views.set(n.id, { el, ta, setMinimized, setPinned, startEdit, stopEdit, isEditing, place });
    return el;
  }

  // ---------- Aktionen ----------

  function showLayer() {
    hidden = false;
    layer.classList.remove('hidden');
  }

  function createNote({ x, y, text = '' } = {}) {
    if (x == null || y == null) {
      x = window.scrollX + Math.max(20, window.innerWidth / 2 - DEFAULT_W / 2) + rand(-40, 40);
      y = window.scrollY + 100 + rand(-20, 40);
    }
    const now = Date.now();
    const n = {
      id: crypto.randomUUID(),
      x: Math.round(Math.max(0, x)), y: Math.round(Math.max(0, y)),
      w: DEFAULT_W, h: DEFAULT_H,
      text, color: 'yellow',
      minimized: false, pinned: false, scope: 'page', project_id: null, created: now, updated: now
    };
    notes.push(n);
    showLayer();
    mountHost();
    layer.appendChild(buildNote(n));
    activeNoteId = n.id;
    setTimeout(() => views.get(n.id)?.startEdit(), 30);
    persist();
    return n;
  }

  function deleteNote(id) {
    clearTimeout(saveTimers.get(id));
    saveTimers.delete(id);
    notes = notes.filter((n) => n.id !== id);
    const v = views.get(id);
    v?.el.remove();
    v?.ta.remove();
    views.delete(id);
    if (activeNoteId === id) activeNoteId = null;
    persist();
  }

  // Wirkt auf die aktive Notiz – oder auf alle, wenn keine aktiv ist.
  function targetIds() {
    return activeNoteId && views.has(activeNoteId) ? [activeNoteId] : notes.map((n) => n.id);
  }

  function setMinimizedFor(value) {
    if (!notes.length) { toast('Keine Notizen auf dieser Seite'); return; }
    showLayer();
    const ids = targetIds();
    let changed = 0;
    for (const id of ids) if (views.get(id)?.setMinimized(value)) changed++;
    if (changed) persist();
    if (ids.length > 1) toast(value ? 'Alle Notizen minimiert' : 'Alle Notizen aufgeklappt');
  }

  function togglePinActive() {
    const id = activeNoteId && views.has(activeNoteId) ? activeNoteId : null;
    if (!id) { toast('Erst eine Notiz anklicken'); return; }
    const n = notes.find((x) => x.id === id);
    views.get(id).setPinned(!n.pinned);
    persist();
    toast(n.pinned ? 'Angepinnt' : 'Gelöst');
  }

  function scrollToNote(id) {
    const n = notes.find((x) => x.id === id);
    if (!n) return;
    showLayer();
    if (!n.pinned) {
      window.scrollTo({ left: Math.max(0, n.x - 80), top: Math.max(0, n.y - 120), behavior: 'smooth' });
    }
    const el = views.get(id)?.el;
    if (el) {
      el.style.zIndex = ++topZ;
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }
  }

  function rand(a, b) { return a + Math.random() * (b - a); }

  // Angepinnte Notizen bei Fenstergröße-Änderung im sichtbaren Bereich halten
  window.addEventListener('resize', () => {
    for (const n of notes) if (n.pinned) views.get(n.id)?.place();
  });

  // Position des Rechtsklicks merken (für "Sticky Note hier einfügen")
  document.addEventListener('contextmenu', (e) => {
    lastContextPos = { x: e.pageX, y: e.pageY, t: Date.now() };
  }, true);

  // Klick außerhalb einer Notiz -> keine Notiz mehr aktiv
  document.addEventListener('pointerdown', (e) => {
    if (!e.composedPath().includes(host)) activeNoteId = null;
  }, true);

  // ---------- Nachrichten von Popup / Background ----------

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg?.type) {
      case 'create': {
        let pos = {};
        if (msg.at === 'context' && lastContextPos && Date.now() - lastContextPos.t < 60000) {
          pos = { x: lastContextPos.x - 20, y: lastContextPos.y - 16 };
        }
        const n = createNote({ ...pos, text: msg.selection ? `> ${msg.selection}\n\n` : '' });
        sendResponse({ ok: true, id: n.id });
        break;
      }
      case 'list':
        sendResponse({
          ok: true, hidden, key: pageKey, host: location.hostname,
          notes: notes.map((n) => ({ ...serialize([n])[0], scope: n.scope || 'page' }))
        });
        break;
      case 'scrollTo':
        scrollToNote(msg.id);
        sendResponse({ ok: true });
        break;
      case 'delete':
        deleteNote(msg.id);
        sendResponse({ ok: true });
        break;
      case 'deleteAll':
        notes = [];
        renderAll();
        persist();
        sendResponse({ ok: true });
        break;
      case 'minimize':
      case 'expand':
        setMinimizedFor(msg.type === 'minimize');
        sendResponse({ ok: true });
        break;
      case 'minimizeAll':
      case 'expandAll':
        activeNoteId = null;
        setMinimizedFor(msg.type === 'minimizeAll');
        sendResponse({ ok: true });
        break;
      case 'togglePin':
        togglePinActive();
        sendResponse({ ok: true });
        break;
      case 'notesChanged':
        if (!msg.origin || msg.origin === location.origin) refreshFromServer();
        sendResponse({ ok: true });
        break;
      case 'toggleHidden':
        hidden = !hidden;
        layer.classList.toggle('hidden', hidden);
        if (msg.fromShortcut) toast(hidden ? 'Notizen ausgeblendet' : 'Notizen eingeblendet');
        sendResponse({ ok: true, hidden });
        break;
      default:
        return false;
    }
    return false;
  });

  // ---------- SPA-Navigation & Host-Schutz ----------
  // Single-Page-Apps ändern die URL ohne Reload -> regelmäßig prüfen.
  setInterval(() => {
    mountHost();
    const k = keyFor(location.href);
    if (k !== pageKey) {
      // Ausstehende Speichervorgänge noch unter der alten URL sichern
      if (saveTimers.size) {
        saveTimers.forEach(clearTimeout);
        saveTimers.clear();
        persist();
      }
      pageKey = k;
      currentUrl = location.href;
      loaded = false;
      known.clear();
      activeNoteId = null;
      showLayer();
      load();
    }
  }, 1000);

  load();
})();
