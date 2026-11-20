// Gemeinsamer, sicherer Mini-Markdown-Renderer (Content Script + Verwaltungsseite).
// Alles wird HTML-escaped; Links sind nur für http(s) und mailto erlaubt.

(() => {
  if (globalThis.StickyMD) return;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const safeUrl = (u) => /^(https?:\/\/|mailto:)/i.test(u);
  const linkHtml = (href, label) =>
    `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;

  // Code und Links werden vorher durch Platzhalter ersetzt, damit ihr Inhalt
  // nicht weiter formatiert wird.
  function inline(s) {
    const tokens = [];
    const tok = (html) => `\u0001${tokens.push(html) - 1}\u0001`;
    s = s.replace(/`([^`]+)`/g, (_, c) => tok(`<code>${esc(c)}</code>`));
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => (safeUrl(u) ? tok(linkHtml(u, t)) : m));
    s = s.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<>()]*[^\s<>().,;:!?'"])/g,
      (_, pre, u) => pre + tok(linkHtml(u.startsWith('www.') ? 'https://' + u : u, u)));
    s = esc(s);
    s = s.replace(/\*\*(?=\S)(.+?)\*\*/g, '<strong>$1</strong>')
         .replace(/__(?=\S)(.+?)__/g, '<strong>$1</strong>')
         .replace(/~~(?=\S)(.+?)~~/g, '<del>$1</del>')
         .replace(/==(?=\S)(.+?)==/g, '<mark>$1</mark>')
         .replace(/(^|[^*\w])\*(?=\S)([^*]+?)\*(?!\*)/g, '$1<em>$2</em>')
         .replace(/(^|[^_\w])_(?=\S)([^_]+?)_(?![_\w])/g, '$1<em>$2</em>');
    return s.replace(/\u0001(\d+)\u0001/g, (_, n) => tokens[+n]);
  }

  function render(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let para = [], quote = [], list = null;

    const flushPara = () => { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } };
    const flushQuote = () => { if (quote.length) { out.push('<blockquote>' + quote.map(inline).join('<br>') + '</blockquote>'); quote = []; } };
    const flushList = () => {
      if (!list) return;
      const start = list.type === 'ol' && list.start !== 1 ? ` start="${list.start}"` : '';
      out.push(`<${list.type}${start}>${list.items.join('')}</${list.type}>`);
      list = null;
    };
    const flushAll = () => { flushPara(); flushQuote(); flushList(); };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      if (/^\s*```/.test(line)) {
        flushAll();
        const code = [];
        for (i++; i < lines.length && !/^\s*```/.test(lines[i]); i++) code.push(lines[i]);
        out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
        continue;
      }
      if (!line.trim()) { flushAll(); continue; }
      if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
        flushAll();
        const lvl = Math.min(m[1].length, 3);
        out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushAll(); out.push('<hr>'); continue; }
      if ((m = line.match(/^>\s?(.*)$/))) { flushPara(); flushList(); quote.push(m[1]); continue; }
      if ((m = line.match(/^(\s*)([-*+]|(\d+)[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/))) {
        flushPara(); flushQuote();
        const type = m[3] != null ? 'ol' : 'ul';
        if (!list || list.type !== type) { flushList(); list = { type, items: [], start: m[3] ? +m[3] : 1 }; }
        const indent = Math.floor(m[1].replace(/\t/g, '  ').length / 2);
        const style = indent ? ` style="margin-left:${indent * 1.2}em"` : '';
        if (m[4] != null) {
          const done = m[4] !== ' ';
          list.items.push(`<li class="task${done ? ' done' : ''}"${style}><input type="checkbox" data-line="${i}"${done ? ' checked' : ''}><span>${inline(m[5])}</span></li>`);
        } else {
          list.items.push(`<li${style}>${inline(m[5])}</li>`);
        }
        continue;
      }
      flushList(); flushQuote();
      para.push(line);
    }
    flushAll();
    return out.join('');
  }

  // Erste Textzeile ohne Markdown-Zeichen
  function plainTitle(text, fallback = 'Neue Notiz') {
    const line = String(text || '').split('\n').find((l) => l.trim() && !/^\s*```/.test(l));
    if (!line) return fallback;
    return line
      .replace(/^\s*(#{1,6}\s+|>\s?|([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?)/, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__|~~|==|`)/g, '')
      .trim() || fallback;
  }

  // Checkbox in Zeile `lineIdx` umschalten
  function toggleTask(text, lineIdx) {
    const lines = String(text || '').split('\n');
    if (lines[lineIdx] == null) return text;
    lines[lineIdx] = lines[lineIdx].replace(/\[([ xX])\]/, (_, c) => (c === ' ' ? '[x]' : '[ ]'));
    return lines.join('\n');
  }

  // Stabile, leichte Schräglage pro Notiz (-1.6° … 1.6°)
  function tiltFor(id) {
    let h = 0;
    for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) | 0;
    return ((Math.abs(h) % 33) - 16) / 10;
  }

  const COLORS = {
    yellow: { name: 'Gelb',   bg: '#fff6a8', head: '#ffed74' },
    pink:   { name: 'Rosa',   bg: '#ffd9e6', head: '#ffc2d6' },
    green:  { name: 'Grün',   bg: '#d8f2c2', head: '#c3e8a3' },
    blue:   { name: 'Blau',   bg: '#d3ebfb', head: '#b8def8' },
    orange: { name: 'Orange', bg: '#ffe1bd', head: '#ffd09a' },
    purple: { name: 'Lila',   bg: '#e9ddf7', head: '#d9c6f1' }
  };

  globalThis.StickyMD = { esc, render, plainTitle, toggleTask, tiltFor, COLORS };
})();
