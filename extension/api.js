// Client für die Anamnesies-API (Service Worker, Popup und Verwaltungsseite).
// Die Erweiterung spricht mit der Web-App (Standard: http://localhost:3000), die /api/v1 an das Backend
// weiterreicht. Angemeldet wird mit dem Browser-Token aus Anamnesies → Einstellungen → Browser.

(() => {
  if (globalThis.AnamApi) return;

  const DEFAULT_SERVER = 'http://localhost:3000';

  class ApiError extends Error {
    constructor(message, status, code) {
      super(message);
      this.status = status;
      this.code = code; // 'not-configured' | 'offline' | 'unauthorized' | 'http'
    }
  }

  function normalizeServer(value) {
    let url = String(value || '').trim() || DEFAULT_SERVER;
    if (!/^https?:\/\//i.test(url)) url = 'http://' + url;
    return url.replace(/\/+$/, '');
  }

  async function getConfig() {
    const { server, token } = await chrome.storage.local.get(['server', 'token']);
    return { server: normalizeServer(server), token: (token || '').trim() };
  }

  async function setConfig({ server, token }) {
    await chrome.storage.local.set({ server: normalizeServer(server), token: (token || '').trim() });
  }

  async function request(method, path, { body, form, raw } = {}) {
    const { server, token } = await getConfig();
    const headers = {};
    if (token) headers['X-Anamnesies-Token'] = token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let response;
    try {
      response = await fetch(`${server}/api/v1/browser${path}`, {
        method,
        headers,
        body: form || (body !== undefined ? JSON.stringify(body) : undefined),
        cache: 'no-store',
        credentials: 'include'
      });
    } catch (_) {
      throw new ApiError(`Anamnesies unter ${server} nicht erreichbar`, 0, 'offline');
    }
    if (raw && response.ok) return response;
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload && typeof payload.detail === 'string' ? payload.detail : response.statusText;
      const code = response.status === 401 || response.status === 403 ? 'unauthorized' : response.status >= 500 && !payload ? 'offline' : 'http';
      const message = code === 'unauthorized' ? 'Token ungültig oder fehlt (Einstellungen der Erweiterung)' : detail || `HTTP ${response.status}`;
      throw new ApiError(message, response.status, code);
    }
    return payload;
  }

  const api = {
    DEFAULT_SERVER,
    ApiError,
    normalizeServer,
    getConfig,
    setConfig,
    status: () => request('GET', '/status'),
    notes: {
      forPage: (url) => request('GET', '/notes?url=' + encodeURIComponent(url)),
      save: (payload) => request('PUT', '/notes', { body: payload }),
      all: () => request('GET', '/notes/all'),
      update: (id, patch) => request('PATCH', `/notes/${id}`, { body: patch }),
      remove: (id) => request('DELETE', `/notes/${id}`),
      restore: (list) => request('POST', '/notes/restore', { body: list })
    },
    websites: {
      list: (url) => request('GET', '/websites' + (url ? '?url=' + encodeURIComponent(url) : '')),
      attach: (form) => request('POST', '/websites', { form }),
      remove: (id) => request('DELETE', `/websites/${id}`),
      screenshot: (id, size) => request('GET', `/websites/${id}/screenshot${size ? '?size=' + size : ''}`, { raw: true }).then((r) => r.blob())
    },
    /** Link in die Web-App, z. B. zu einem Projekt. */
    async appUrl(path = '/') {
      const { server } = await getConfig();
      return server + path;
    }
  };

  globalThis.AnamApi = api;
})();
