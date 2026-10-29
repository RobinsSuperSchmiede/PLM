import { createHmac, timingSafeEqual } from 'node:crypto';

export const accessCookieName = 'plm_access';

export function configuredAccessCode(): string | null {
  const code = process.env.APP_ACCESS_CODE;
  return code && /^\d{6}$/.test(code) ? code : null;
}

/** Cookie value derived from the access code, so changing the code invalidates existing sessions. */
export function accessToken(code: string): string {
  return createHmac('sha256', code).update('plm-access-v1').digest('hex');
}

export function hasAccess(cookieValue: string | undefined): boolean {
  const code = configuredAccessCode();
  if (!code || !cookieValue) return false;
  const expected = Buffer.from(accessToken(code));
  const provided = Buffer.from(cookieValue);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export function apiBaseUrl(): string {
  return (process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
}

export const pendingCookieName = 'plm_pending';

/** Cookie for the second login step: the challenge id, signed with the access code. */
export function pendingToken(code: string, challengeId: string): string {
  return `${challengeId}.${createHmac('sha256', code).update(`plm-pending-v1:${challengeId}`).digest('hex')}`;
}

/** Returns the challenge id if the pending cookie was issued by this server. */
export function readPending(cookieValue: string | undefined): string | null {
  const code = configuredAccessCode();
  if (!code || !cookieValue) return null;
  const challengeId = cookieValue.slice(0, cookieValue.lastIndexOf('.'));
  if (!challengeId) return null;
  const expected = Buffer.from(pendingToken(code, challengeId));
  const provided = Buffer.from(cookieValue);
  return expected.length === provided.length && timingSafeEqual(expected, provided) ? challengeId : null;
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

/** Calls the API's second-factor endpoints from the server (they are not reachable through the browser proxy). */
export async function authApi<T>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/v1/auth/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    return { ok: response.ok, status: response.status, data: (await response.json().catch(() => null)) as T | null };
  } catch {
    return { ok: false, status: 502, data: null };
  }
}
