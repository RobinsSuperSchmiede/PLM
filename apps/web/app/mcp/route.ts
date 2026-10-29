import { NextResponse } from 'next/server';

import { apiBaseUrl } from '@/lib/access';

export const dynamic = 'force-dynamic';

const forwardedRequestHeaders = ['accept', 'authorization', 'content-type', 'mcp-protocol-version', 'mcp-session-id', 'last-event-id', 'origin'];
const forwardedResponseHeaders = ['content-type', 'mcp-session-id', 'www-authenticate', 'cache-control'];

/**
 * Exposes the MCP endpoint of the API under the web app's origin, so a single custom domain
 * (reverse proxy / tunnel to port 3000) serves both the UI and https://<domain>/mcp.
 * Host allowlist and token checks happen in the API.
 */
async function proxy(request: Request) {
  const headers = new Headers();
  for (const name of forwardedRequestHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set('x-forwarded-host', request.headers.get('host') ?? '');

  try {
    const response = await fetch(`${apiBaseUrl()}/mcp`, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD', 'DELETE'].includes(request.method) ? undefined : await request.text(),
      cache: 'no-store',
    });
    const responseHeaders = new Headers();
    for (const name of forwardedResponseHeaders) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ detail: 'MCP server not reachable.' }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as DELETE };
