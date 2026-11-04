import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ar } from "@/messages/ar";
const auth = vi.hoisted(() => ({
  login: vi.fn(async (_data: unknown) => ({ redirect: "/dashboard" })),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/auth", () => ({
  login: auth.login,
  verifyOtp: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  logout: vi.fn(),
  rotate: vi.fn(),
  requireActor: vi.fn(),
}));
import { POST } from "@/app/api/auth/[action]/route";
function loginRequest(origin: string, body: unknown) {
  return new Request("https://www.beyond-track.online/api/auth/login", {
    method: "POST",
    headers: {
      Origin: origin,
      Host: "www.beyond-track.online",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "https://beyond-track1.vercel.app");
  vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());
describe("Custom-domain login boundary", () => {
  it("reaches input validation on the custom domain without touching accounts", async () => {
    const response = await POST(
      loginRequest("https://www.beyond-track.online", {}),
      { params: Promise.resolve({ action: "login" }) },
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ error: ar.errors.invalid });
    expect(auth.login).not.toHaveBeenCalled();
  });
  it("submits validated credentials to authentication on the same host", async () => {
    const response = await POST(
      loginRequest("https://www.beyond-track.online", {
        identifier: "Engineer@Example.com",
        password: "test-only-password",
        remember: false,
      }),
      { params: Promise.resolve({ action: "login" }) },
    );
    expect(response.status).toBe(200);
    expect(auth.login).toHaveBeenCalledWith({
      identifier: "engineer@example.com",
      password: "test-only-password",
      remember: false,
    });
    expect(await response.json()).toEqual({ redirect: "/dashboard" });
  });
  it("rejects foreign-origin login before authentication", async () => {
    const response = await POST(
      loginRequest("https://evil.invalid", {
        identifier: "engineer@example.com",
        password: "test-only-password",
      }),
      { params: Promise.resolve({ action: "login" }) },
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: ar.errors.forbidden });
    expect(auth.login).not.toHaveBeenCalled();
  });
});
