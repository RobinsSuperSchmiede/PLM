import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { authApi, pendingCookieName, sessionCookieName, type SessionUser } from '@/lib/access';

export const dynamic = 'force-dynamic';

type Status = { mode: 'single' | 'multi'; setup_required: boolean; user: SessionUser | null };

/** Mode of the installation and the signed-in account (if any). */
export async function GET() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  const status = await authApi<Status>('status', { token });
  if (!status.ok || !status.data) {
    return NextResponse.json({ error: 'API server not reachable.' }, { status: 502 });
  }
  const { mode, setup_required, user } = status.data;
  const response = NextResponse.json({ mode, setup_required, user });
  // An expired or revoked token is useless; drop the cookie.
  if (mode === 'multi' && token && !user) response.cookies.delete(sessionCookieName);
  return response;
}

/** Sign out: the session ends at the API, the cookie is removed. */
export async function DELETE() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (token) await authApi('logout', { token, body: {} });
  const response = NextResponse.json({ signedIn: false });
  response.cookies.delete(sessionCookieName);
  response.cookies.delete(pendingCookieName);
  return response;
}
