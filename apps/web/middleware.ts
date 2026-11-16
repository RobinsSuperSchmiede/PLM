import { NextResponse, type NextRequest } from 'next/server';

import { apiBaseUrl, sessionCookieName } from '@/lib/access';

export const config = { matcher: '/api/v1/:path*' };

const prefix = '/api/v1/';

/**
 * Proxy for /api/v1/*: requests are passed straight on to the FastAPI backend (a rewrite, streamed by
 * Next) with the session cookie turned into `Authorization: Bearer`. The API checks the token and picks
 * the account's workspace; without accounts (AUTH_MODE=single) it serves the one local workspace.
 */
export function middleware(request: NextRequest) {
  let segments: string[];
  try {
    segments = request.nextUrl.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
  } catch {
    return notFound();
  }
  // The sign-in endpoints are only for the web app's own server routes. Segments are compared after
  // decoding (so "%61uth" cannot slip through) and odd ones are refused instead of forwarded.
  if (segments[0] === 'auth' || segments.some((segment) => segment === '' || segment === '.' || segment === '..' || segment.includes('/') || segment.includes(String.fromCharCode(92)))) {
    return notFound();
  }

  const headers = new Headers(request.headers);
  // Cookies are for this server only; the API gets the session token and nothing else.
  headers.delete('cookie');
  headers.delete('authorization');
  const token = request.cookies.get(sessionCookieName)?.value;
  if (token) headers.set('authorization', `Bearer ${token}`);

  const target = `${apiBaseUrl()}${prefix}${segments.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  return NextResponse.rewrite(new URL(target), { request: { headers } });
}

function notFound() {
  return NextResponse.json({ detail: 'Not found' }, { status: 404 });
}
