import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { accessCookieName, apiBaseUrl, hasAccess } from '@/lib/access';

export const dynamic = 'force-dynamic';

/** Forwards /api/v1/* to the FastAPI backend for browsers that unlocked the workspace. */
async function proxy(request: Request, { params }: { params: { path: string[] } }) {
  if (!hasAccess(cookies().get(accessCookieName)?.value)) {
    return NextResponse.json({ detail: 'Locked. Enter the access code first.' }, { status: 401 });
  }

  // The login endpoints are only for the web app's own server routes.
  if (params.path[0] === 'auth') return NextResponse.json({ detail: 'Not found' }, { status: 404 });

  const source = new URL(request.url);
  const target = `${apiBaseUrl()}/api/v1/${params.path.map(encodeURIComponent).join('/')}${source.search}`;
  const hasBody = !['GET', 'HEAD'].includes(request.method);

  try {
    const response = await fetch(target, {
      method: request.method,
      // Bodies are forwarded as raw bytes so file uploads (multipart) keep their boundary and binary content.
      headers: { 'content-type': request.headers.get('content-type') ?? 'application/json', accept: request.headers.get('accept') ?? 'application/json' },
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
    });
    const headers = new Headers({ 'content-type': response.headers.get('content-type') ?? 'application/json' });
    for (const name of ['content-disposition', 'cache-control', 'x-content-type-options']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(response.status === 204 ? null : await response.arrayBuffer(), { status: response.status, headers });
  } catch {
    return NextResponse.json({ detail: `API server not reachable at ${apiBaseUrl()}` }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as PUT, proxy as DELETE };
