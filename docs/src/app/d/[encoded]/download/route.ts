import { NextResponse } from 'next/server';
import { buildPendingShareCookie } from '@/lib/deferred-share';
import { buildSplashViewModel, SPLASH_DOWNLOAD_URL } from '@/lib/share-splash';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ encoded: string }> },
): Promise<NextResponse> {
  const { encoded } = await params;
  const response = NextResponse.redirect(SPLASH_DOWNLOAD_URL, 302);

  const view = buildSplashViewModel(encoded);
  if (view.kind === 'ok') {
    response.cookies.set(buildPendingShareCookie(encoded));
  }

  return response;
}
