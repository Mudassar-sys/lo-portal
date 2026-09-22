import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Routes reachable without a session.
 *
 * The public borrower intake is deliberately here: it is a branded page a
 * lender hands to a borrower, and it writes through one security definer
 * function that resolves the tenant from the link token.
 */
const PUBLIC_PREFIXES = ["/login", "/auth", "/intake", "/api/mock"];

const isPublic = (pathname: string) =>
  PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        },
      },
    }
  );

  // Do not run code between createServerClient and
  // supabase.auth.getClaims(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering
  // with the Supabase client, your users may be randomly logged out.
  //
  // getClaims verifies the token's signature rather than trusting the cookie,
  // and refreshes the session when the token is close to expiring. That
  // refresh is also what enforces the seat: a session that has lost its seat
  // is refused a new token by the access token hook and stops here.
  const { data } = await supabase.auth.getClaims();

  const claims = data?.claims;

  if (!claims && !isPublic(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return withSessionCookies(NextResponse.redirect(url), supabaseResponse);
  }

  // A signed in seat has no business on the sign in page.
  if (claims && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return withSessionCookies(NextResponse.redirect(url), supabaseResponse);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is. If you're
  // creating a new response object with NextResponse.next() make sure to:
  // 1. Pass the request in it, like so:
  //    const myNewResponse = NextResponse.next({ request })
  // 2. Copy over the cookies, like so:
  //    myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll())
  // 3. Change the myNewResponse object to fit your needs, but avoid changing
  //    the cookies!
  // 4. Finally:
  //    return myNewResponse
  // If this is not done, you may be causing the browser and server to go out
  // of sync and terminate the user's session prematurely!
  return supabaseResponse;
}

/**
 * The two redirects above are exactly the case the comment warns about: a
 * different response object is being returned, so the refreshed cookies and
 * the cache headers have to be carried across or the browser and the server
 * fall out of sync and the session ends early.
 */
function withSessionCookies(next: NextResponse, supabaseResponse: NextResponse) {
  // The guide writes this as cookies.setAll(...), but ResponseCookies in
  // Next.js 16 exposes get, getAll, set and delete only, so the cookies are
  // carried across one at a time. Each entry already carries its options.
  for (const cookie of supabaseResponse.cookies.getAll()) {
    next.cookies.set(cookie);
  }
  for (const header of ["cache-control", "expires", "pragma"]) {
    const value = supabaseResponse.headers.get(header);
    if (value) next.headers.set(header, value);
  }
  return next;
}
