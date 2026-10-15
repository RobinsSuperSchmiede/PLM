import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const accessCode = process.env.APP_ACCESS_CODE;
  if (!accessCode || !/^\d{6}$/.test(accessCode)) {
    return NextResponse.json({ error: 'Access code is not configured.' }, { status: 503 });
  }

  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || !('code' in payload) || payload.code !== accessCode) {
    return NextResponse.json({ error: 'Invalid access code.' }, { status: 401 });
  }

  return NextResponse.json({ valid: true });
}
