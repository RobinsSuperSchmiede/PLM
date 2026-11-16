import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { authApi, cookieOptions, pendingCookieName, secondsUntil, sessionCookieName, type LoginPayload } from '@/lib/access';

export const dynamic = 'force-dynamic';

/** Step 2: the code from Telegram. Body {code}; with {resend: true} a new code is sent instead. */
export async function POST(request: Request) {
  const pending = (await cookies()).get(pendingCookieName)?.value;
  if (!pending) {
    return NextResponse.json({ error: 'Sign-in expired. Enter your password again.', expired: true }, { status: 401 });
  }

  const payload: unknown = await request.json().catch(() => null);
  const body = (payload && typeof payload === 'object' ? payload : {}) as { code?: unknown; resend?: unknown };

  if (body.resend === true) {
    const result = await authApi<{ expires_at?: string; detail?: string }>('resend', { body: { pending_token: pending } });
    if (result.status === 401) return NextResponse.json({ error: 'Sign-in expired.', expired: true }, { status: 401 });
    if (!result.ok) {
      return NextResponse.json({ error: result.data?.detail ?? 'Could not send the code.' }, { status: result.status === 429 ? 429 : 503 });
    }
    const response = NextResponse.json({ resent: true, expires_at: result.data?.expires_at });
    response.cookies.set(pendingCookieName, pending, cookieOptions(request, 60 * 10));
    return response;
  }

  if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
    return NextResponse.json({ error: 'Enter the six-digit code.' }, { status: 400 });
  }

  const result = await authApi<LoginPayload & { valid: boolean; remaining: number }>('verify', { body: { pending_token: pending, code: body.code } });
  if (!result.ok || !result.data) return NextResponse.json({ error: 'API server not reachable.' }, { status: 502 });
  if (!result.data.valid || !result.data.token) {
    const expired = result.data.remaining === 0;
    const response = NextResponse.json({ error: 'Invalid code.', remaining: result.data.remaining, expired }, { status: 401 });
    if (expired) response.cookies.delete(pendingCookieName);
    return response;
  }

  const response = NextResponse.json({ user: result.data.user });
  response.cookies.set(sessionCookieName, result.data.token, cookieOptions(request, secondsUntil(result.data.expires_at, 60 * 60 * 24 * 30)));
  response.cookies.delete(pendingCookieName);
  return response;
}
