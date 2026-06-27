import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { rateLimit } from '@/lib/rate-limit';

const PROTECTED_PREFIXES = ['/dashboard', '/wallet', '/inventory', '/trades', '/profile'];
const ADMIN_PREFIXES = ['/admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ---- Rate limiting for API + mutations ----
  if (pathname.startsWith('/api/')) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anonymous';
    const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    const limit = isWrite ? 20 : 100;
    const { success, remaining, resetAt } = rateLimit(`${ip}:${pathname}`, limit);
    if (!success) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((resetAt - Date.now()) / 1000)) } }
      );
    }
    const res = NextResponse.next();
    res.headers.set('X-RateLimit-Remaining', String(remaining));
    return res;
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const needsAdmin = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));

  if ((needsAuth || needsAdmin) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.searchParams.set('auth', 'required');
    return NextResponse.redirect(url);
  }

  if (needsAdmin && user) {
    // NOTE: this is a UX redirect only, sourced from the user_metadata.role cache
    // (re-synced on every login in /api/auth/steam/callback). The authoritative
    // check is requireRole() in every /api/admin/* route, which reads the Prisma
    // `role` column directly — that's what actually protects admin actions.
    const role = (user.user_metadata?.role as string) || 'USER';
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
