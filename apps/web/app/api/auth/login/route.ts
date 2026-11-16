import { NextResponse } from 'next/server';

import {
  authApi, clientAddress, cookieOptions, pendingCookieName, secondsUntil, sessionCookieName, type LoginPayload,
} from '@/lib/access';

export const dynamic = 'force-dynamic';

/**
 * Step 1: username and password. With `setup: true` the first (admin) account is created instead –
 * the API only allows that while no account exists. If Telegram two-factor sign-in is on for the
 * account, the browser gets a short-lived pending cookie instead (step 2: /api/auth/verify).
 */
export async function POST(request: Request) {
  const payload: unknown = await request.json().catch(() => null);
  const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
  const username = typeof body.username === 'string' ? body.username : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) {
    return NextResponse.json({ error: 'Enter username and password.' }, { status: 400 });
  }

  const result = await authApi<LoginPayload>(body.setup === true ? 'setup' : 'login', {
    body: {
      username,
      password,
      display_name: typeof body.display_name === 'string' ? body.display_name : undefined,
      user_agent: request.headers.get('user-agent')?.slice(0, 500) ?? undefined,
      client: clientAddress(request) || undefined,
    },
  });
  if (!result.ok || !result.data) {
    return NextResponse.json({ error: result.data?.detail ?? 'API server not reachable.' }, { status: result.status === 502 ? 502 : result.status });
  }

  const data = result.data;
  if (data.second_factor && data.pending_token) {
    const response = NextResponse.json({ second_factor: data.second_factor, expires_at: data.challenge_expires_at });
    response.cookies.set(pendingCookieName, data.pending_token, cookieOptions(request, 60 * 10));
    return response;
  }
  if (!data.token) return NextResponse.json({ error: 'Sign-in failed.' }, { status: 500 });

  const response = NextResponse.json({ user: data.user });
  response.cookies.set(sessionCookieName, data.token, cookieOptions(request, secondsUntil(data.expires_at, 60 * 60 * 24 * 30)));
  response.cookies.delete(pendingCookieName);
  return response;
}
