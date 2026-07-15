import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Next.js 16: the `middleware` file convention is deprecated and renamed to
// `proxy`. This file replaces src/middleware.ts + src/utils/supabase/middleware.ts.
// Proxy is an OPTIMISTIC check only — real authorization lives at the data layer
// (RLS + per-route getUser()). Here we refresh the Supabase session cookie and
// revalidate it server-side via getUser().
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run any code between createServerClient and getUser().
  // getUser() revalidates the token server-side (AUTH-02) — it is NOT a mere
  // cookie-presence check, so a forged/expired cookie is rejected.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith('/login') || path.startsWith('/auth');

  // API routes must NEVER be redirected to the HTML login page. They authenticate
  // themselves, and each has a different mechanism the proxy cannot speak for:
  //   - /api/settings/keys, /api/youtube/analyze → per-route getUser() → 401
  //   - /api/prices/refresh → bearer secret (pg_cron has NO cookie)
  // Redirecting them broke two things (both verified live 2026-07-15, then fixed):
  //   1. AUTH-06 promised 401 on an unauthenticated request; the proxy returned a
  //      307 to /login instead, so the route's 401 gate never executed.
  //   2. The pg_cron refresh POST — even WITH the correct secret — was 307'd to
  //      /login, meaning the scheduled refresh would have silently never run once
  //      deployed, with no error surfaced.
  // The session refresh above still applies to /api requests; only the redirect
  // is skipped. This matches this file's stated contract: the proxy is an
  // OPTIMISTIC check; real authorization lives at the data layer.
  const isApi = path.startsWith('/api');

  // Not authenticated and requesting a protected page → send to /login.
  if (!user && !isPublic && !isApi) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Already authenticated and hitting /login → send to home.
  if (user && path.startsWith('/login')) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, icons or other assets in public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
