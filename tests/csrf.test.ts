import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { csrf } from "@/server/security";
const production = "https://www.beyond-track.online";
function request(
  url = production + "/api/auth/login",
  origin: string | null = production,
  headers: Record<string, string> = {},
) {
  return new Request(url, {
    method: "POST",
    headers: {
      ...(origin !== null ? { Origin: origin } : {}),
      "Content-Type": "application/json",
      ...headers,
    },
    body: "{}",
  });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://beyond-track1.vercel.app");
});
afterEach(() => vi.unstubAllEnvs());
describe("Same-origin CSRF validation across deployment domains", () => {
  it("accepts the custom domain despite a different configured email-link origin", () => {
    expect(() => csrf(request())).not.toThrow();
    expect(() =>
      csrf(
        request(production + "/api/commands", production, {
          Host: "www.beyond-track.online",
          "Sec-Fetch-Site": "same-origin",
        }),
      ),
    ).not.toThrow();
  });
  it("supports same-origin apex and Vercel aliases without a wildcard allowlist", () => {
    for (const origin of [
      "https://beyond-track.online",
      "https://beyond-track1.vercel.app",
    ])
      expect(() =>
        csrf(request(origin + "/api/auth/login", origin)),
      ).not.toThrow();
    vi.stubEnv("APP_URL", "");
    expect(() => csrf(request())).not.toThrow();
  });
  it("uses the public host behind TLS termination and ignores forwarded-host spoofing", () => {
    expect(() =>
      csrf(
        request("http://127.0.0.1:3000/api/auth/login", production, {
          Host: "www.beyond-track.online",
        }),
      ),
    ).not.toThrow();
    expect(() =>
      csrf(
        request(production + "/api/commands", "https://evil.invalid", {
          Host: "www.beyond-track.online",
          "X-Forwarded-Host": "evil.invalid",
          Forwarded: "host=evil.invalid",
        }),
      ),
    ).toThrow();
  });
  it("rejects other sites, sibling subdomains, suffix lookalikes, and a configured cross-origin", () => {
    for (const origin of [
      "https://evil.invalid",
      "https://beyond-track.online",
      "https://www.beyond-track.online.evil.invalid",
      "https://beyond-track1.vercel.app",
      "http://www.beyond-track.online",
      "https://www.beyond-track.online:8443",
    ])
      expect(() =>
        csrf(request(undefined, origin, { Host: "www.beyond-track.online" })),
      ).toThrow();
  });
  it("rejects missing, opaque, noncanonical, malformed, and explicitly cross-site origins", () => {
    for (const origin of [
      null,
      "null",
      "",
      "https://www.beyond-track.online/path",
      "https://www.beyond-track.online?query=1",
      "https://user@www.beyond-track.online",
      "https://www.beyond-track.online/",
      "not-a-url",
    ])
      expect(() => csrf(request(undefined, origin))).toThrow();
    expect(() =>
      csrf(request(undefined, production, { "Sec-Fetch-Site": "cross-site" })),
    ).toThrow();
  });
  it("rejects malformed host headers and never falls back to forwarded headers", () => {
    for (const Host of [
      "user@www.beyond-track.online",
      "www.beyond-track.online/path",
      "www.beyond-track.online#fragment",
      "www.beyond-track.online,evil.invalid",
      "www.beyond-track.online:99999",
    ])
      expect(() => csrf(request(undefined, production, { Host }))).toThrow();
  });
  it("keeps exact ports and local development working, including production loopback verification", () => {
    for (const origin of [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://[::1]:3000",
    ])
      expect(() =>
        csrf(request(origin + "/api/auth/login", origin)),
      ).not.toThrow();
    expect(() =>
      csrf(
        request(
          "http://localhost:3000/api/auth/login",
          "http://localhost:3001",
        ),
      ),
    ).toThrow();
    vi.stubEnv("NODE_ENV", "development");
    expect(() =>
      csrf(
        request(
          "http://local.test:3000/api/auth/login",
          "http://local.test:3000",
          { Host: "local.test:3000" },
        ),
      ),
    ).not.toThrow();
  });
});
