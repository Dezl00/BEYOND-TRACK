// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Lookup, MultiLookup, SelectBox } from "@/components/dropdown";
import { Modal, Button, Field } from "@/components/ui";
import Filters from "@/components/filters";
import ActivationSwitch from "@/components/activation-switch";
import Shell from "@/components/shell";
import Breadcrumbs from "@/components/breadcrumbs";
import RequestPurge from "@/components/request-purge";
import { ar } from "@/messages/ar";
import type { Actor } from "@/lib/domain";

const nav = vi.hoisted(() => ({
  params: "",
  path: "/requests",
  replace: vi.fn(),
  push: vi.fn(),
  prefetch: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => nav,
  usePathname: () => nav.path,
  useSearchParams: () => new URLSearchParams(nav.params),
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
vi.mock("@/components/live-notifications", () => ({ default: () => null }));
beforeEach(() => {
  nav.params = "";
  nav.path = "/requests";
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
              { id: "p1", name: "المشروع الأول", code: "P1" },
              { id: "p2", name: "المشروع الثاني", code: "P2" },
            ],
            next: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Searchable anchored dropdowns", () => {
  it("invalidates cached choices immediately after an activation change", async () => {
    let enabled = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              items: enabled
                ? [
                    { id: "u1", name: "متر" },
                    { id: "u2", name: "قطعة" },
                  ]
                : [{ id: "u2", name: "قطعة" }],
              next: null,
            }),
            { status: 200 },
          ),
      ),
    );
    const user = userEvent.setup();
    render(
      createElement(Lookup, {
        resource: "units",
        value: "",
        onChange: vi.fn(),
      }),
    );
    await user.click(screen.getByRole("button", { name: ar.common.select }));
    await screen.findByRole("option", { name: "متر" });
    await user.keyboard("{Escape}");
    enabled = false;
    fireEvent(window, new Event("siteflow-update"));
    await user.click(screen.getByRole("button", { name: ar.common.select }));
    await screen.findByRole("option", { name: "قطعة" });
    expect(screen.queryByRole("option", { name: "متر" })).toBeNull();
  });
  it("searches local options and selects with the keyboard without opening a modal", async () => {
    function Form() {
      const [value, setValue] = useState("a");
      return createElement(SelectBox, {
        value,
        onChange: setValue,
        options: [
          { value: "a", label: "مهندس موقع" },
          { value: "b", label: "مسؤول المشتريات" },
        ],
      });
    }
    const user = userEvent.setup();
    render(createElement(Form));
    await user.click(screen.getByRole("button", { name: "مهندس موقع" }));
    const search = screen.getByRole("combobox");
    await user.type(search, "مشتريات");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(
      screen.getByRole("button", { name: "مسؤول المشتريات" }),
    ).toBeTruthy();
    expect(document.querySelector(".dialog-overlay")).toBeNull();
  });
  it("keeps multiple project selections open inside the account form and closes only the dropdown on Escape", async () => {
    function Form() {
      const [values, setValues] = useState<string[]>([]);
      return createElement(Modal, {
        title: ar.nav.users,
        trigger: createElement(Button, null, ar.common.create),
        children: createElement(Field, {
          label: ar.fields.projects,
          children: createElement(MultiLookup, {
            resource: "projects",
            values,
            onChange: setValues,
          }),
        }),
      });
    }
    const user = userEvent.setup();
    render(createElement(Form));
    await user.click(screen.getByRole("button", { name: ar.common.create }));
    await user.click(screen.getByRole("button", { name: ar.common.select }));
    const first = await screen.findByRole("option", { name: /المشروع الأول/ });
    await user.click(first);
    await user.click(screen.getByRole("option", { name: /المشروع الثاني/ }));
    expect(
      screen.getByRole("listbox").getAttribute("aria-multiselectable"),
    ).toBe("true");
    expect(
      screen
        .getAllByRole("option")
        .every((option) => option.getAttribute("aria-selected") === "true"),
    ).toBe(true);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /P1.*المشروع الأول.*P2.*المشروع الثاني/,
      }),
    ).toBeTruthy();
  });
  it("omits the all-projects choice when only one assigned project exists", async () => {
    const actor = {
      id: "owner",
      name: "أدمن",
      is_owner: true,
      force_password_change: false,
      permissions: [],
    } as unknown as Actor;
    const user = userEvent.setup();
    render(
      createElement(Shell, {
        actor,
        digits: 0,
        projectChoices: [{ id: "p1", name: "المشروع الأول" }],
        children: null,
      }),
    );
    expect(screen.queryByText(ar.common.allProjects)).toBeNull();
    expect(screen.queryByText(ar.common.project)).toBeNull();
    await user.click(screen.getByRole("button", { name: "المشروع الأول" }));
    await screen.findByRole("option", { name: /المشروع الأول/ });
    expect(
      screen.queryByRole("option", { name: ar.common.allProjects }),
    ).toBeNull();
  });
});

describe("Immediate table controls", () => {
  it("searches without Enter or a filter button and removes stale pagination", async () => {
    nav.params = "project=p1&cursor=old";
    render(createElement(Filters, { statuses: true }));
    expect(screen.queryByRole("button", { name: ar.common.filter })).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: ar.common.search }), {
      target: { value: "خرسانة" },
    });
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const query = new URL(
      nav.replace.mock.calls.at(-1)![0],
      "https://example.com",
    ).searchParams;
    expect(query.get("q")).toBe("خرسانة");
    expect(query.get("project")).toBe("p1");
    expect(query.has("cursor")).toBe(false);
  });
  it("selects a request status tab immediately and preserves the search", async () => {
    nav.params = "q=steel";
    const user = userEvent.setup();
    render(createElement(Filters, { statuses: true }));
    const tab = screen.getByRole("tab", { name: ar.statuses[9] });
    await user.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("combobox")).toBeNull();
    const query = new URL(
      nav.replace.mock.calls.at(-1)![0],
      "https://example.com",
    ).searchParams;
    expect(query.get("status")).toBe("9");
    expect(query.get("q")).toBe("steel");
    expect(nav.replace.mock.calls.at(-1)![1]).toEqual({ scroll: false });
  });
  it("rolls an optimistic activation switch back when the server rejects the action", async () => {
    let reject!: (reason: Error) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((_resolve, rejectPromise) => {
            reject = rejectPromise;
          }),
      ),
    );
    const user = userEvent.setup();
    render(
      createElement(ActivationSwitch, {
        resource: "unit",
        id: "unit",
        active: true,
        name: "متر",
      }),
    );
    const toggle = screen.getByRole("switch");
    await user.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    reject(new Error(ar.errors.forbidden));
    await waitFor(() =>
      expect(toggle.getAttribute("aria-checked")).toBe("true"),
    );
    expect(screen.getByRole("alert").textContent).toBe(ar.errors.forbidden);
  });
});

describe("Header, breadcrumbs, and maintenance controls", () => {
  it("moves the profile into the header and requires confirmation before logout", async () => {
    const user = userEvent.setup();
    render(
      createElement(Shell, {
        actor: {
          id: "owner",
          name: "Mohamed",
          role_name: "دور",
          is_owner: true,
          force_password_change: false,
          permissions: [],
        } as unknown as Actor,
        digits: 0,
        children: null,
      }),
    );
    expect(
      within(document.querySelector("header")!).getByText("Mohamed"),
    ).toBeTruthy();
    expect(document.querySelector(".sidebar .profile")).toBeNull();
    expect(
      screen.queryByRole("link", { name: ar.settings.profile }),
    ).toBeNull();
    const account = screen.getByRole("button", { name: ar.settings.profile });
    await user.click(account);
    expect(account.getAttribute("aria-expanded")).toBe("true");
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getByRole("menuitem", { name: ar.nav.settings })
        .getAttribute("href"),
    ).toBe("/settings");
    await user.click(
      within(menu).getByRole("menuitem", { name: ar.common.logout }),
    );
    expect(
      screen.getByRole("dialog", { name: ar.settings.logoutConfirm }),
    ).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: ar.common.cancel }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("links nested request breadcrumbs and preserves the project context", () => {
    nav.path = "/requests/request-id/attachments";
    nav.params = "project=p1";
    render(createElement(Breadcrumbs, { title: ar.fields.attachments }));
    expect(
      screen.getByRole("link", { name: ar.nav.dashboard }).getAttribute("href"),
    ).toBe("/dashboard?project=p1");
    expect(
      screen.getByRole("link", { name: ar.nav.requests }).getAttribute("href"),
    ).toBe("/requests?project=p1");
    expect(
      screen
        .getByRole("link", { name: ar.requests.detail })
        .getAttribute("href"),
    ).toBe("/requests/request-id?project=p1");
    expect(
      screen
        .getByRole("heading", { level: 1, name: ar.fields.attachments })
        .parentElement?.getAttribute("aria-current"),
    ).toBe("page");
  });
  it("places search and export in the page heading outside the data panel", () => {
    nav.path = "/users";
    render(
      createElement(
        "div",
        null,
        createElement(Filters, { title: ar.nav.users, exportable: true }),
        createElement("section", { className: "panel" }),
      ),
    );
    const heading = document.querySelector(".page-heading")!;
    expect(
      within(heading as HTMLElement).getByRole("textbox", {
        name: ar.common.search,
      }),
    ).toBeTruthy();
    expect(
      within(heading as HTMLElement)
        .getByRole("link", { name: ar.common.export })
        .getAttribute("href"),
    ).toContain("resource=users");
    expect(document.querySelector(".panel input")).toBeNull();
    expect(screen.queryByText("تصدير الصفحة")).toBeNull();
  });
  it("keeps the selected project bound to both purge confirmation steps", async () => {
    const user = userEvent.setup();
    const projectId = "22222222-2222-4222-8222-222222222222";
    const challenge = "11111111-1111-4111-8111-111111111111";
    const commands: { command: string; data: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, options: RequestInit) => {
        if (url.startsWith("/api/options"))
          return Response.json({
            items: [{ id: projectId, name: "مشروع KS" }],
            next: null,
          });
        const body = JSON.parse(options.body as string);
        commands.push(body);
        return Response.json(
          body.command === "request-purge-code"
            ? { challenge }
            : { deleted: 2 },
        );
      }),
    );
    render(createElement(RequestPurge, { email: "owner@example.com" }));
    await user.click(screen.getByRole("button", { name: ar.settings.purge }));
    await user.click(
      screen.getByRole("switch", { name: ar.settings.purgeConfirm }),
    );
    await user.click(
      screen.getByRole("button", { name: ar.common.allProjects }),
    );
    await user.click(await screen.findByRole("option", { name: "مشروع KS" }));
    const send = screen.getByRole("button", {
      name: ar.settings.purgeSend,
    }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await user.click(
      screen.getByRole("switch", { name: ar.settings.purgeProjectConfirm }),
    );
    await user.click(send);
    const code = await screen.findByRole("textbox", {
      name: ar.settings.purgeCode,
    });
    expect(
      (
        screen.getByRole("button", {
          name: "مشروع KS",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.type(code, "123456");
    await user.click(screen.getByRole("button", { name: ar.common.delete }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(commands).toEqual([
      { command: "request-purge-code", data: { projectId } },
      {
        command: "request-purge-confirm",
        data: { projectId, challenge, code: "123456" },
      },
    ]);
  });
  it("requires scope acknowledgement and a six-digit emailed code before purging", async () => {
    const user = userEvent.setup();
    const request = vi.fn(async (_url: unknown, options: RequestInit) => {
      const body = JSON.parse(options.body as string);
      return new Response(
        JSON.stringify(
          body.command === "request-purge-code"
            ? { challenge: "11111111-1111-4111-8111-111111111111" }
            : { deleted: 3 },
        ),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", request);
    render(createElement(RequestPurge, { email: "owner@example.com" }));
    await user.click(screen.getByRole("button", { name: ar.settings.purge }));
    const send = screen.getByRole("button", {
      name: ar.settings.purgeSend,
    }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await user.click(
      screen.getByRole("switch", { name: ar.settings.purgeConfirm }),
    );
    await user.click(send);
    const code = await screen.findByRole("textbox", {
      name: ar.settings.purgeCode,
    });
    expect(request).toHaveBeenCalledTimes(1);
    const remove = screen.getByRole("button", {
      name: ar.common.delete,
    }) as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    await user.type(code, "123456");
    await user.click(remove);
    await waitFor(() =>
      expect(screen.getByText(ar.settings.purgeDone)).toBeTruthy(),
    );
    expect(JSON.parse(request.mock.calls[1][1].body as string)).toEqual({
      command: "request-purge-confirm",
      data: {
        challenge: "11111111-1111-4111-8111-111111111111",
        code: "123456",
      },
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
