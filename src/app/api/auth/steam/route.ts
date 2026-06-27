import { NextResponse } from 'next/server';
import { buildLoginUrl } from '@/lib/steam-openid';

export async function GET(request: Request) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const realm = appUrl;
  const returnTo = `${appUrl}/api/auth/steam/callback`;
  return NextResponse.redirect(buildLoginUrl(realm, returnTo));
}
