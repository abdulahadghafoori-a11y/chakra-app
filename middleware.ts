import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isMetaSocialWebhookDisabledInCoreMode,
  isPathRestrictedInCoreMode,
} from "@/lib/feature-set";
import {
  isAuthSecretConfigured,
  STAFF_SESSION_COOKIE,
  verifyStaffSessionJwt,
} from "@/lib/staff-auth/session";

/** Paths that never require staff JWT (including anonymous order flow). */
function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname === "/login") return true;
  if (pathname === "/orders/new") return true;
  if (pathname.startsWith("/sales/login")) return true;
  if (/^\/orders\/[^/]+\/confirmation$/.test(pathname)) return true;
  if (pathname.startsWith("/api/webhooks/")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/api/webhooks/meta" &&
    isMetaSocialWebhookDisabledInCoreMode()
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  if (isPathRestrictedInCoreMode(pathname)) {
    return new NextResponse(null, { status: 404 });
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthSecretConfigured()) {
    return new NextResponse(
      "App is misconfigured. Set AUTH_SECRET (32+ characters) in the environment.",
      { status: 503 },
    );
  }

  const cookieVal = request.cookies.get(STAFF_SESSION_COOKIE)?.value;
  if (cookieVal && (await verifyStaffSessionJwt(cookieVal))) {
    return NextResponse.next();
  }

  const login = new URL("/login", request.url);
  const nextUrl = request.nextUrl.clone();
  nextUrl.searchParams.delete("token");
  login.searchParams.set(
    "next",
    `${nextUrl.pathname}${nextUrl.search}`,
  );
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Match all paths except Next internals and static assets.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
