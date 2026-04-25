/**
 * App-wide middleware — protects only private routes.
 * Public: home, scan results, history, demo, auth pages.
 * Protected: /dashboard, /profile and similar account pages.
 */
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

// Routes that require authentication
const PROTECTED_PATHS = ["/dashboard", "/profile", "/settings"];

// Routes that are always public
const PUBLIC_PATHS = ["/login", "/register", "/api"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  const isPublic    = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Redirect unauthenticated users away from protected routes only
  if (!req.auth && isProtected && !isPublic) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg|.*\\.webp).*)",
  ],
};
