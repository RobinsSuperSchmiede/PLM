import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import {
  accessCookieName, accessToken, authApi, configuredAccessCode, cookieOptions, hasAccess, pendingCookieName, pendingToken,
} from '@/lib/access';

export const dynamic = 'force-dynamic';

type Challenge = { challenge_id: string; expires_at: string };

export async function GET() {
  return NextResponse.json({ granted: hasAccess(cookies().get(accessCookieName)?.value) });
}

/**
 * Step 1: the six-digit access code. If two-factor login is enabled, a code is sent via Telegram
 * and the browser gets a short-lived pending cookie instead of access (step 2: /api/access-code/verify).
 */
export async function POST(request: Request) {
  const accessCode = configuredAccessCode();
  if (!accessCode) {
    return NextResponse.json({ error: 'Access code is not configured.' }, { status: 503 });
  }

  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('code' in payload) || payload.code !== accessCode) {
    return NextResponse.json({ error: 'Invalid access code.' }, { status: 401 });
  }

  const factor = await authApi<{ required: boolean }>('second-factor');
  if (!factor.ok || !factor.data) {
    // Fail closed: without the API we cannot know whether a second factor is required.
    return NextResponse.json({ error: 'API server not reachable.' }, { status: 502 });
  }

  if (factor.data.required) {
    const challenge = await authApi<Challenge & { detail?: string }>('challenge', {});
    if (!challenge.ok || !challenge.data?.challenge_id) {
      return NextResponse.json({ error: challenge.data?.detail ?? 'Could not send the login code.' }, { status: challenge.status === 429 ? 429 : 503 });
    }
    const response = NextResponse.json({ second_factor: 'telegram', expires_at: challenge.data.expires_at });
    response.cookies.set(pendingCookieName, pendingToken(accessCode, challenge.data.challenge_id), cookieOptions(request, 60 * 10));
    return response;
  }

  const response = NextResponse.json({ valid: true });
  response.cookies.set(accessCookieName, accessToken(accessCode), cookieOptions(request, 60 * 60 * 24 * 30));
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ granted: false });
  response.cookies.delete(accessCookieName);
  response.cookies.delete(pendingCookieName);
  return response;
}
