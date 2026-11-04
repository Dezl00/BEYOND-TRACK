import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
describe("Public login identity assets", () => {
  it("serves the logo variants and favicon anonymously with security headers", () => {
    for (const asset of [
      "/logo.svg",
      "/logo-dark.svg",
      "/icon.svg",
      "/apple-touch-icon.png",
      "/pwa-192.png",
      "/pwa-512.png",
      "/pwa-maskable.png",
      "/manifest.webmanifest",
      "/offline",
    ]) {
      const response = proxy(new NextRequest("https://example.com" + asset));
      expect(response.status).toBe(200);
      expect(response.headers.has("location")).toBe(false);
      expect(response.headers.get("Cache-Control")).toContain("public");
      expect(response.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'none'",
      );
      expect(response.headers.get("Content-Security-Policy")).toContain(
        "worker-src 'self'",
      );
    }
  });
  it("keeps unknown assets and nested paths protected", () => {
    for (const path of ["/logo.svg/private", "/private.svg", "/requests"]) {
      const response = proxy(new NextRequest("https://example.com" + path));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        "https://example.com/login",
      );
    }
  });
  it("keeps attachment and business APIs protected", () => {
    for (const path of [
      "/api/attachments/secret",
      "/api/options?resource=projects",
      "/api/commands",
    ]) {
      const response = proxy(new NextRequest("https://example.com" + path));
      expect(response.status).toBe(401);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });
});
