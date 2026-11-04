import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Actor } from "@/lib/domain";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const auth = vi.hoisted(() => ({ actor: null as Actor | null }));
vi.mock("@/server/auth", () => ({ currentActor: async () => auth.actor }));
vi.mock("next/navigation", () => ({
  redirect: (path: string): never => {
    throw new Error(`redirect:${path}`);
  },
  usePathname: () => "/settings/security",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ prefetch: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => createElement("a", { href, className }, children),
}));
import { requirePageActor } from "@/server/page-auth";
import Shell from "@/components/shell";
import { ar } from "@/messages/ar";

const owner = {
  id: "owner",
  name: "أدمن",
  is_owner: true,
  permissions: [],
  force_password_change: true,
  role_name: "أدمن",
} as unknown as Actor;
beforeEach(() => {
  auth.actor = null;
});

describe("First-login page access", () => {
  it("redirects an expired or missing session to login even on the security page", async () => {
    await expect(requirePageActor()).rejects.toThrow("redirect:/login");
    await expect(requirePageActor(true)).rejects.toThrow("redirect:/login");
  });
  it("redirects forced-password navigation and prefetches instead of throwing an application error", async () => {
    auth.actor = owner;
    await expect(requirePageActor()).rejects.toThrow(
      "redirect:/settings/security",
    );
    await expect(requirePageActor(true)).resolves.toBe(owner);
  });
  it("restores application page access after the password requirement is cleared", async () => {
    auth.actor = { ...owner, force_password_change: false };
    await expect(requirePageActor()).resolves.toBe(auth.actor);
  });
  it("renders only security navigation until the temporary password is changed", () => {
    const html = renderToStaticMarkup(
      createElement(Shell, { actor: owner, digits: 0, children: null }),
    );
    expect(html).toContain('href="/settings/security"');
    for (const path of [
      "/dashboard",
      "/projects",
      "/requests",
      "/notifications",
      "/boq",
    ])
      expect(html).not.toContain(`href="${path}"`);
    expect(html).not.toContain(ar.common.allProjects);
    expect(html).toContain(ar.common.logout);
  });
  it("restores navigation and project selection after changing the password", () => {
    const html = renderToStaticMarkup(
      createElement(Shell, {
        actor: { ...owner, force_password_change: false },
        digits: 0,
        children: null,
      }),
    );
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('aria-controls="notification-popover"');
    expect(html).toContain(ar.common.allProjects);
  });
  it("does not offer project selection to a role without project viewing permission", () => {
    const html = renderToStaticMarkup(
      createElement(Shell, {
        actor: { ...owner, is_owner: false, force_password_change: false },
        digits: 0,
        children: null,
      }),
    );
    expect(html).not.toContain(ar.common.allProjects);
  });
});
