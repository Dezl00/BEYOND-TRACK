// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MobileNavigation from "@/components/mobile-navigation";
import MoreNavigation from "@/components/more-navigation";
import { ProjectContext } from "@/components/project-selector";
import BoqTabs from "@/components/boq-tabs";
import { mobileNavigation } from "@/lib/navigation";
import { ar } from "@/messages/ar";
import type { Actor } from "@/lib/domain";
const nav = vi.hoisted(() => ({
  path: "/requests/id",
  params: "project=p1",
  push: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.params),
  useRouter: () => nav,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    prefetch: _prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) =>
    createElement("a", { href, ...props }, children),
}));
const engineer = {
  name: "مهندس",
  is_owner: false,
  permissions: ["projects.view", "requests.view", "boq.view"],
  force_password_change: false,
} as Actor;
beforeEach(() => {
  nav.path = "/requests/id";
  nav.params = "project=p1";
  vi.clearAllMocks();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            items: [
              { id: "p1", name: "المشروع الأول" },
              { id: "p2", name: "المشروع الثاني" },
            ],
            next: null,
          }),
          { status: 200 },
        ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Permission-scoped mobile navigation", () => {
  it("selects the important sections by role and keeps other departments out", () => {
    expect(mobileNavigation(engineer)).toEqual([
      "dashboard",
      "requests",
      "notifications",
    ]);
    expect(
      mobileNavigation({
        ...engineer,
        permissions: [...engineer.permissions, "technical.view"],
      }),
    ).toContain("technical");
    expect(mobileNavigation({ ...engineer, is_owner: true })).toEqual([
      "dashboard",
      "requests",
      "procurement",
      "receipts",
    ]);
    render(createElement(MobileNavigation, { actor: engineer }));
    expect(screen.queryByRole("link", { name: ar.mobile.finance })).toBeNull();
    expect(
      screen
        .getByRole("link", { name: ar.mobile.requests })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: ar.mobile.more }).getAttribute("href"),
    ).toBe("/more?project=p1");
  });
  it("marks more active for secondary sections and hides navigation until password change", () => {
    nav.path = "/boq";
    const view = render(createElement(MobileNavigation, { actor: engineer }));
    expect(
      screen
        .getByRole("link", { name: ar.mobile.more })
        .getAttribute("aria-current"),
    ).toBe("page");
    view.rerender(
      createElement(MobileNavigation, {
        actor: { ...engineer, force_password_change: true },
      }),
    );
    expect(screen.queryByRole("navigation")).toBeNull();
  });
  it("puts project selection above logout in more and preserves project context", async () => {
    nav.path = "/more";
    const user = userEvent.setup();
    render(
      createElement(
        ProjectContext.Provider,
        {
          value: {
            name: "المشروع الأول",
            choices: [
              { id: "p1", name: "المشروع الأول" },
              { id: "p2", name: "المشروع الثاني" },
            ],
          },
        },
        createElement(MoreNavigation, { actor: engineer }),
      ),
    );
    const grid = document.querySelector(".more-grid")!;
    expect(
      within(grid as HTMLElement)
        .getByRole("link", { name: ar.nav.boq })
        .getAttribute("href"),
    ).toBe("/boq?project=p1");
    expect(screen.queryByRole("link", { name: ar.nav.users })).toBeNull();
    const picker = screen.getByRole("button", { name: "المشروع الأول" }),
      logout = screen.getByRole("button", { name: ar.common.logout });
    expect(
      picker.compareDocumentPosition(logout) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(picker);
    await user.click(
      await screen.findByRole("option", { name: "المشروع الثاني" }),
    );
    expect(nav.push).toHaveBeenCalledWith("/more?project=p2", {
      scroll: false,
    });
  });
  it("renders connected BOQ pill navigation on the import page", () => {
    const view = render(
      createElement(BoqTabs, {
        current: "import",
        project: "p1",
        canImport: true,
        canUnits: true,
      }),
    );
    expect(
      screen
        .getByRole("link", { name: ar.common.import })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: ar.boq.materials }).getAttribute("href"),
    ).toBe("/materials?project=p1");
    expect(screen.getByRole("link", { name: ar.boq.units })).toBeTruthy();
    view.rerender(
      createElement(BoqTabs, {
        current: "boq",
        canImport: false,
        canUnits: false,
      }),
    );
    expect(screen.queryByRole("link", { name: ar.boq.units })).toBeNull();
    expect(screen.queryByRole("link", { name: ar.common.import })).toBeNull();
  });
});
