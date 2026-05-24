import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const hostname = request.headers.get("host") || "";
  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // Pass through /api, /_next, /favicon.ico, /logo.png etc.
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/logo.png" ||
    pathname.startsWith("/public/")
  ) {
    return NextResponse.next();
  }

  // Checkout pages are public on any domain
  if (pathname.startsWith("/checkout/")) {
    return NextResponse.rewrite(new URL(`/sandbox${pathname}`, request.url));
  }

  // Docs page is public on any domain
  if (pathname.startsWith("/docs")) {
    return NextResponse.next();
  }

  // ─── auth.nexapay.space — Login / Register ───
  if (hostname.startsWith("auth.")) {
    const hasSession = request.cookies.has("nexapay_session");
    if (hasSession) {
      return NextResponse.redirect("https://sandbox.nexapay.space");
    }
    // Default / to /login
    const targetPath = pathname === "/" ? "/auth/login" : `/auth${pathname}`;
    return NextResponse.rewrite(new URL(targetPath, request.url));
  }

  // ─── sandbox.nexapay.space — Dashboard (protected) ───
  if (hostname.startsWith("sandbox.")) {
    const hasSession = request.cookies.has("nexapay_session");
    if (!hasSession) {
      return NextResponse.redirect("https://auth.nexapay.space/login");
    }
    // Default / to /dashboard
    const targetPath = pathname === "/" ? "/sandbox/dashboard" : `/sandbox${pathname}`;
    return NextResponse.rewrite(new URL(targetPath, request.url));
  }

  // ─── admin.nexapay.space — Admin Panel ───
  if (hostname.startsWith("admin.")) {
    // Admin uses its own auth (admin_token in localStorage/X-Admin-Token header)
    // No cookie check needed — admin login page handles its own auth
    const targetPath = pathname === "/" ? "/sandbox/admin/login" : `/sandbox${pathname}`;
    return NextResponse.rewrite(new URL(targetPath, request.url));
  }

  // ─── nexapay.space / www — Public landing ───
  // Default / to the landing page
  const landingPath = pathname === "/" ? "/landing" : `/landing${pathname}`;
  return NextResponse.rewrite(new URL(landingPath, request.url));
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|logo.png).*)"],
};
