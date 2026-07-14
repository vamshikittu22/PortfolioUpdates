import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Server-side signout endpoint (AUTH-03). Clears the Supabase session using the
// cookie-bound server client and redirects to /login. Provides a robust,
// server-driven logout path in addition to the client-side signOut() in the
// dashboard layout.
export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    await supabase.auth.signOut();
  }

  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`, { status: 303 });
}
