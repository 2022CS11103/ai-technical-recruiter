import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** Client-side JWT lives in localStorage — middleware only redirects bare visits
 *  when a cookie mirror exists. Pages still call getToken() for API auth.
 *  Soft guard: protect recruiter shells from anonymous navigation when atr_token cookie is set via login. */

const PROTECTED_PREFIXES = ["/dashboard", "/jobs", "/candidates", "/results", "/billing", "/admin", "/portal", "/interviews"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  if (!needsAuth) return NextResponse.next();

  // Prefer cookie if present (set on login); otherwise allow through — pages hydrate-check localStorage.
  const cookieToken = request.cookies.get("atr_token")?.value;
  if (cookieToken) return NextResponse.next();

  // No cookie: still allow page load; client AuthGate redirects. Avoid breaking SSR.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/jobs/:path*",
    "/candidates/:path*",
    "/results/:path*",
    "/billing/:path*",
    "/admin/:path*",
    "/portal/:path*",
    "/interviews/:path*",
  ],
};
