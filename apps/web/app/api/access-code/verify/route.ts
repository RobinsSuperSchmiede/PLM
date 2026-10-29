import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  accessCookieName, accessToken, authApi, configuredAccessCode, cookieOptions, pendingCookieName, pendingToken, readPending,
} from '@/lib/access';

export const dynamic = 'force-dynamic';

/** Step 2: the code from Telegram. Body {code}; with {resend: true} a new code is sent instead. */
export async function POST(request: Request) {
  const accessCode = configuredAccessCode();
  const challengeId = readPending(cookies().get(pendingCookieName)?.value);
  if (!accessCode || !challengeId) {
    return NextResponse.json({ error: 'Login expired. Enter the access code again.', expired: true }, { status: 401 });
  }

  const payload: unknown = await request.json().catch(() => null);
  const body = (payload && typeof payload === 'object' ? payload : {}) as { code?: unknown; resend?: unknown };

  if (body.resend === true) {
    const challenge = await authApi<{ challenge_id: string; expires_at: string; detail?: string }>('challenge', {});
    if (!challenge.ok || !challenge.data?.challenge_id) {
      return NextResponse.json({ error: challenge.data?.detail ?? 'Could not send the login code.' }, { status: challenge.status === 429 ? 429 : 503 });
    }
    const response = NextResponse.json({ resent: true, expires_at: challenge.data.expires_at });
    response.cookies.set(pendingCookieName, pendingToken(accessCode, challenge.data.challenge_id), cookieOptions(request, 60 * 10));
    return response;
  }

  if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
    return NextResponse.json({ error: 'Enter the six-digit code.' }, { status: 400 });
  }

  const result = await authApi<{ valid: boolean; remaining: number }>('verify', { challenge_id: challengeId, code: body.code });
  if (!result.ok || !result.data) return NextResponse.json({ error: 'API server not reachable.' }, { status: 502 });
  if (!result.data.valid) {
    return NextResponse.json({ error: 'Invalid code.', remaining: result.data.remaining, expired: result.data.remaining === 0 }, { status: 401 });
  }

  const response = NextResponse.json({ valid: true });
  response.cookies.set(accessCookieName, accessToken(accessCode), cookieOptions(request, 60 * 60 * 24 * 30));
  response.cookies.delete(pendingCookieName);
  return response;
}
