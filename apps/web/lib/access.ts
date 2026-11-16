/**
 * Server-side helpers for signing in. The API decides about accounts and sessions; this server only
 * keeps the access token in an httpOnly cookie (never readable by page scripts) and forwards it to the
 * API as `Authorization: Bearer`.
 */

export const sessionCookieName = 'plm_session';
/** Second sign-in step (Telegram code): the API's pending token, valid for ten minutes. */
export const pendingCookieName = 'plm_pending';

export function apiBaseUrl(): string {
  return (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
}

export function cookieOptions(request: Request, maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: new URL(request.url).protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https',
    path: '/',
    maxAge,
  };
}

/** Seconds until an ISO timestamp (at least one minute). */
export function secondsUntil(iso: string | null | undefined, fallback: number): number {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) ? Math.max(60, Math.round((at - Date.now()) / 1000)) : fallback;
}

/** Address of the browser, for the API's sign-in throttling. */
export function clientAddress(request: Request): string {
  return (request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? '').trim().slice(0, 128);
}

/** Calls the API's sign-in endpoints from the server (they are not reachable through the browser proxy). */
export async function authApi<T>(path: string, options: { body?: unknown; token?: string; method?: string } = {}): Promise<{ ok: boolean; status: number; data: T | null }> {
  const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  try {
    const response = await fetch(`${apiBaseUrl()}/api/v1/auth/${path}`, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: 'no-store',
    });
    return { ok: response.ok, status: response.status, data: (await response.json().catch(() => null)) as T | null };
  } catch {
    return { ok: false, status: 502, data: null };
  }
}

export type SessionUser = { id: string; username: string; display_name: string | null; is_admin: boolean };

export type LoginPayload = {
  token?: string | null;
  expires_at?: string | null;
  user?: SessionUser | null;
  second_factor?: string | null;
  pending_token?: string | null;
  challenge_expires_at?: string | null;
  detail?: string;
};
