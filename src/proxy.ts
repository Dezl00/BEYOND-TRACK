import { NextResponse, type NextRequest } from "next/server";
import { ar } from "@/messages/ar";
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""}; worker-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ${process.env.NODE_ENV === "development" ? "ws:" : ""}; frame-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; ${process.env.NODE_ENV === "production" ? "upgrade-insecure-requests;" : ""}`;
  const h = new Headers(request.headers);
  h.set("x-nonce", nonce);
  h.set("Content-Security-Policy", csp);
  h.set("x-pathname", request.nextUrl.pathname);
  h.set("x-project-id", request.nextUrl.searchParams.get("project") || "");
  const path = request.nextUrl.pathname;
  const publicAsset = [
    "/logo.svg",
    "/logo-dark.svg",
    "/icon.svg",
    "/apple-touch-icon.png",
    "/pwa-192.png",
    "/pwa-512.png",
    "/pwa-maskable.png",
    "/manifest.webmanifest",
    "/offline",
  ].includes(path);
  const publicPath =
    path === "/login" ||
    path.startsWith("/api/auth/") ||
    path === "/api/jobs" ||
    publicAsset;
  const cookie =
    process.env.NODE_ENV === "production" ? "__Host-bt" : "bt-session";
  let response: NextResponse;
  if (!publicPath && !request.cookies.has(cookie))
    response = path.startsWith("/api/")
      ? NextResponse.json({ error: ar.errors.forbidden }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));
  else response = NextResponse.next({ request: { headers: h } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set(
    "Cache-Control",
    publicAsset ? "public, max-age=3600, must-revalidate" : "private, no-store",
  );
  return response;
}
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|beyond.svg|riyal.svg|sw.js).*)",
  ],
};
