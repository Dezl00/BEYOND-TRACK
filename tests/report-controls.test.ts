// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RequestPrintOptions from "@/components/request-print-options";
import ReportFilters from "@/components/report-filters";
import ProjectSelector, { ProjectContext } from "@/components/project-selector";
import DocumentActions from "@/components/document-actions";
import { reportQuerySchema } from "@/lib/reporting";
import { ar } from "@/messages/ar";
const nav = vi.hoisted(() => ({
  path: "/reports",
  params: "",
  replace: vi.fn(),
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
    createElement("a", { ...props, href }, children),
}));
const p1 = "11111111-1111-4111-8111-111111111111",
  p2 = "22222222-2222-4222-8222-222222222222",
  item = "33333333-3333-4333-8333-333333333333";
beforeEach(() => {
  vi.clearAllMocks();
  nav.path = "/reports";
  nav.params = `project=${p1}`;
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
              { id: p1, name: "مشروع أول" },
              { id: p2, name: "مشروع ثان" },
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
describe("Report filters and print selection", () => {
  it("opens a request preview with exactly the selected sections and optional prices/photos", async () => {
    const user = userEvent.setup();
    render(
      createElement(RequestPrintOptions, { id: "request-id", canPrice: true }),
    );
    await user.click(screen.getByRole("button", { name: ar.common.print }));
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("switch", { name: ar.printing.receipts }),
    );
    await user.click(
      within(dialog).getByRole("switch", { name: ar.printing.attachments }),
    );
    await user.click(
      within(dialog).getByRole("switch", { name: ar.printing.timeline }),
    );
    await user.click(
      within(dialog).getByRole("switch", { name: ar.printing.prices }),
    );
    await user.click(
      within(dialog).getByRole("switch", { name: ar.printing.photos }),
    );
    const href = within(dialog)
      .getByRole("link", { name: ar.printing.preview })
      .getAttribute("href")!;
    const params = new URL(href, "https://test.invalid").searchParams;
    expect(Object.fromEntries(params)).toEqual({
      materials: "1",
      receipts: "0",
      attachments: "1",
      timeline: "1",
      prices: "1",
      photos: "1",
    });
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
  });
  it("prevents an empty print document and keeps prices out for users without access", async () => {
    const user = userEvent.setup();
    render(createElement(RequestPrintOptions, { id: "r", canPrice: false }));
    await user.click(screen.getByRole("button", { name: ar.common.print }));
    expect(
      screen.queryByRole("switch", { name: ar.printing.prices }),
    ).toBeNull();
    await user.click(
      screen.getByRole("switch", { name: ar.printing.materials }),
    );
    await user.click(
      screen.getByRole("switch", { name: ar.printing.receipts }),
    );
    expect(screen.getByRole("alert").textContent).toBe(ar.printing.noSections);
    expect(
      screen.queryByRole("link", { name: ar.printing.preview }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: ar.printing.preview,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("filters Arabic search automatically, preserves dates/items, and exports the whole filtered report", async () => {
    const query = reportQuerySchema.parse({
      project: p1,
      items: item,
      from: "2026-01-01",
      to: "2026-02-28",
    });
    render(
      createElement(ReportFilters, {
        query,
        exportable: true,
        context: {
          id: p1,
          code: "P1",
          name: "مشروع",
          location: "",
          archived: false,
          selected: [{ id: item, code: "01", name: "بند" }],
        },
      }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: ar.common.search }), {
      target: { value: "خرسانة" },
    });
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const target = new URL(
      nav.replace.mock.calls.at(-1)![0],
      "https://test.invalid",
    );
    expect(target.searchParams.get("q")).toBe("خرسانة");
    expect(target.searchParams.get("items")).toBe(item);
    expect(target.searchParams.get("from")).toBe("2026-01-01");
    const print = screen.getByRole("link", { name: ar.common.print });
    expect(print.getAttribute("href")).toContain("/reports/print?");
    expect(
      screen.getByRole("link", { name: ar.common.export }).getAttribute("href"),
    ).not.toContain("cursor");
    fireEvent.click(screen.getByRole("button", { name: ar.common.reset }));
    expect(nav.replace.mock.calls.at(-1)![0]).toBe(`/reports?project=${p1}`);
  });
  it("clears item selections when the shell changes report projects", async () => {
    nav.params = `project=${p1}&items=${item}&cursor=old&from=2026-01-01`;
    const user = userEvent.setup();
    render(
      createElement(
        ProjectContext.Provider,
        {
          value: {
            name: "مشروع أول",
            choices: [
              { id: p1, name: "مشروع أول" },
              { id: p2, name: "مشروع ثان" },
            ],
          },
        },
        createElement(ProjectSelector),
      ),
    );
    await user.click(screen.getByRole("button", { name: "مشروع أول" }));
    await user.click(await screen.findByRole("option", { name: "مشروع ثان" }));
    const target = new URL(
      nav.push.mock.calls.at(-1)![0],
      "https://test.invalid",
    );
    expect(target.searchParams.get("project")).toBe(p2);
    expect(target.searchParams.has("items")).toBe(false);
    expect(target.searchParams.has("cursor")).toBe(false);
    expect(target.searchParams.get("from")).toBe("2026-01-01");
  });
  it("waits for all print sections before enabling the print action", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(
      createElement(DocumentActions, {
        back: "/requests/id",
        sections: ["materials", "receipts"],
      }),
    );
    const button = screen.getByRole("button", {
      name: ar.common.print,
    }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const material = document.createElement("span"),
      receipt = document.createElement("span");
    material.dataset.printComplete = "materials";
    receipt.dataset.printComplete = "receipts";
    document.body.appendChild(material);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(button.disabled).toBe(true);
    document.body.appendChild(receipt);
    await waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect(print).toHaveBeenCalledOnce();
    material.remove();
    receipt.remove();
    print.mockRestore();
  });
});
