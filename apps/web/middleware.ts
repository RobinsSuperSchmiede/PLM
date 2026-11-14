import { NextResponse, type NextRequest } from 'next/server';

import { accessCookieName, apiBaseUrl, hasAccess } from '@/lib/access';

// Runs on Node.js so the cookie check can share lib/access.ts (node:crypto) with the login routes.
export const config = { matcher: '/api/v1/:path*', runtime: 'nodejs' };

const prefix = '/api/v1/';

/**
 * Gate for /api/v1/*: browsers that unlocked the workspace are passed straight on to the FastAPI
 * backend (a rewrite, streamed by Next), everyone else gets 401. This replaces a route handler that
 * fetched and re-sent every response itself.
 */
export function middleware(request: NextRequest) {
  if (!hasAccess(request.cookies.get(accessCookieName)?.value)) {
    return NextResponse.json({ detail: 'Locked. Enter the access code first.' }, { status: 401 });
  }

  let segments: string[];
  try {
    segments = request.nextUrl.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
  } catch {
    return notFound();
  }
  // The login endpoints are only for the web app's own server routes. Segments are compared after
  // decoding (so "%61uth" cannot slip through) and odd ones are refused instead of forwarded.
  if (segments[0] === 'auth' || segments.some((segment) => segment === '' || segment === '.' || segment === '..' || segment.includes('/') || segment.includes(String.fromCharCode(92)))) {
    return notFound();
  }

  const headers = new Headers(request.headers);
  // The access cookie is for this server only; the API does not need it.
  headers.delete('cookie');

  const target = `${apiBaseUrl()}${prefix}${segments.map(encodeURIComponent).join('/')}${request.nextUrl.search}`;
  return NextResponse.rewrite(new URL(target), { request: { headers } });
}

function notFound() {
  return NextResponse.json({ detail: 'Not found' }, { status: 404 });
}
