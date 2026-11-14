export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function describeError(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const { detail } = body as { detail: unknown };
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((entry) => (entry && typeof entry === 'object' && 'msg' in entry ? String(entry.msg) : String(entry)))
        .join(', ');
    }
  }
  return fallback;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    // Without a JSON body the answer came from the forwarding layer, not from the API itself.
    const fallback = payload === null && response.status >= 500 ? 'API server not reachable' : response.statusText || 'Request failed';
    throw new ApiError(describeError(payload, fallback), response.status);
  }
  if (method === 'GET') lastResponses.set(path, payload);
  return payload as T;
}

/**
 * The last successful GET response per path, kept for this browser tab. Pages start from it with
 * `peek()` so revisiting a page shows its data at once while the fresh request runs in the background.
 */
const lastResponses = new Map<string, unknown>();

export function peek<T>(path: string): T | undefined {
  return lastResponses.get(path) as T | undefined;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  delete: <T = void>(path: string) => request<T>('DELETE', path),
};
