// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TechnicalReview from "@/components/technical-review";
import ReceiptForm from "@/components/receipt-form";
import { QuotationEditor } from "@/components/quotation-editor";
import {
  remainingQuantity,
  receiptQuantityError,
  changeReceiptQuantity,
} from "@/lib/receiving";
const state = vi.hoisted(() => ({ command: vi.fn() }));
vi.mock("@/components/ui", async () => {
  const actual =
    await vi.importActual<typeof import("@/components/ui")>("@/components/ui");
  return {
    ...actual,
    command: state.command,
    Lookup: ({
      value,
      onChange,
    }: {
      value: string;
      onChange: (v: string) => void;
    }) =>
      createElement("input", {
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value),
      }),
    DateInput: ({
      value,
      onChange,
    }: {
      value: string;
      onChange: (v: string) => void;
    }) =>
      createElement("input", {
        type: "date",
        value,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onChange(e.target.value),
      }),
  };
});
const requestId = "10000000-0000-4000-8000-000000000001",
  lineId = "10000000-0000-4000-8000-000000000002";
const lines = [
  {
    id: lineId,
    material_name: "خرسانة",
    quantity: "10",
    accepted: "4",
    returned: "0",
    unit_name: "م³",
  },
];
beforeEach(() => {
  state.command.mockReset();
  state.command.mockResolvedValue({ id: requestId });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: crypto.randomUUID() }),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("Receiving form", () => {
  it("reviews each material, requires its rejection reason, and supports approving the full list", async () => {
    const done = vi.fn(),
      user = userEvent.setup(),
      second = { ...lines[0], id: crypto.randomUUID(), material_name: "حديد" };
    render(
      createElement(TechnicalReview, {
        request: { id: requestId, version: 2 },
        lines: [lines[0], second],
        onDone: done,
        onBusyChange: vi.fn(),
      }),
    );
    const submit = screen.getByRole("button", {
      name: "حفظ المراجعة",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await user.click(screen.getByRole("button", { name: "اعتماد الكل" }));
    expect(submit.disabled).toBe(false);
    await user.click(screen.getByRole("button", { name: "رفض حديد" }));
    expect(submit.disabled).toBe(true);
    await user.type(
      screen.getByRole("textbox", { name: "ملاحظة رفض حديد" }),
      "راجع المقاس",
    );
    await user.click(submit);
    expect(state.command).toHaveBeenCalledWith("technical-review", {
      id: requestId,
      version: 2,
      lines: [
        { id: lineId, approved: true, note: "" },
        { id: second.id, approved: false, note: "راجع المقاس" },
      ],
    });
    expect(done).toHaveBeenCalledOnce();
  });
  it("prefills outstanding quantities, adjusts accepted for damage and requires every upload to finish", async () => {
    const done = vi.fn(),
      user = userEvent.setup();
    render(createElement(ReceiptForm, { requestId, lines, onDone: done }));
    expect(
      (screen.getByLabelText("خرسانة · المقبول") as HTMLInputElement).value,
    ).toBe("6");
    fireEvent.change(screen.getByLabelText("خرسانة · المرفوض"), {
      target: { value: "2" },
    });
    expect(
      (screen.getByLabelText("خرسانة · المقبول") as HTMLInputElement).value,
    ).toBe("4");
    const submit = screen.getByRole("button", {
      name: "تأكيد الاستلام",
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const picker = document.querySelector(
      'input[type="file"][multiple]',
    ) as HTMLInputElement;
    await user.upload(picker, [
      new File(["one"], "one.png", { type: "image/png" }),
      new File(["two"], "two.jpg", { type: "image/jpeg" }),
    ]);
    await waitFor(() => expect(submit.disabled).toBe(false));
    expect(
      document.querySelector('input[capture="environment"]'),
    ).not.toBeNull();
    await user.click(submit);
    expect(state.command).toHaveBeenCalledWith(
      "receipt",
      expect.objectContaining({
        attachmentIds: expect.any(Array),
        lines: [
          { lineId, accepted: "4", damaged: "0", rejected: "2", returned: "0" },
        ],
      }),
    );
    expect(state.command.mock.calls[0][1].attachmentIds).toHaveLength(2);
    expect(done).toHaveBeenCalledOnce();
  });
  it("keeps confirmation disabled after a failed upload", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "فشل الرفع" }),
    } as Response);
    const user = userEvent.setup();
    render(createElement(ReceiptForm, { requestId, lines, onDone: vi.fn() }));
    await user.upload(
      document.querySelector(
        'input[type="file"][multiple]',
      ) as HTMLInputElement,
      new File(["one"], "one.png", { type: "image/png" }),
    );
    await screen.findByText("فشل الرفع");
    expect(
      (
        screen.getByRole("button", {
          name: "تأكيد الاستلام",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(state.command).not.toHaveBeenCalled();
  });
  it("handles decimals, previous returns and combined receipt limits", () => {
    expect(remainingQuantity("0.3", "0.2", "0.1")).toBe("0.2");
    expect(
      receiptQuantityError("10", "4", "0", {
        accepted: "6",
        damaged: "1",
        rejected: "0",
        returned: "0",
      }),
    ).toBe("receiptLimit");
    expect(
      receiptQuantityError("10", "4", "0", {
        accepted: "8",
        damaged: "0",
        rejected: "0",
        returned: "2",
      }),
    ).toBeNull();
    expect(
      receiptQuantityError("10", "0", "0", {
        accepted: "11",
        damaged: "0",
        rejected: "0",
        returned: "1",
      }),
    ).toBe("returned");
    expect(
      changeReceiptQuantity(
        { accepted: "6", damaged: "0", rejected: "0", returned: "0" },
        "damaged",
        "2",
      ).accepted,
    ).toBe("4");
  });
});
describe("Supplier quotations", () => {
  it("offers a single pricing table with distinct multi-file inputs", () => {
    render(
      createElement(QuotationEditor, {
        request: { id: requestId, version: 1 },
        lines,
        quotes: [],
        onDone: vi.fn(),
      }),
    );
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(screen.queryByRole("switch")).toBeNull();
    for (const label of ["عرض السعر", "عروض أسعار أخرى"])
      expect(
        (
          document.querySelector(
            'input[type="file"][aria-label="' + label + '"]',
          ) as HTMLInputElement
        ).multiple,
      ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "إرسال لمدير الحسابات",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
