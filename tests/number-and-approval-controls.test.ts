// @vitest-environment jsdom
import { createElement, useState } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { NumberField } from "@/components/number-field";
import ResourceForm from "@/components/resource-form";
import { RequestActions } from "@/components/request-actions";
import type { Actor } from "@/lib/domain";
import { decimalText } from "@/lib/format";
import { ar } from "@/messages/ar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function Quantity() {
  const [value, setValue] = useState(decimalText("1000.000"));
  return createElement(NumberField, {
    label: "الكمية",
    value,
    onChange: setValue,
  });
}
describe("Numeric controls", () => {
  it("removes padding and preserves fractional precision through single steps and manual input", () => {
    render(createElement(Quantity));
    const input = screen.getByRole("spinbutton", {
      name: "الكمية",
    }) as HTMLInputElement;
    expect(input.value).toBe("1000");
    fireEvent.click(screen.getByRole("button", { name: "زيادة الكمية" }));
    expect(input.value).toBe("1001");
    fireEvent.change(input, { target: { value: "٢٫٢٥٠" } });
    fireEvent.blur(input);
    expect(input.value).toBe("2.25");
    fireEvent.click(screen.getByRole("button", { name: "إنقاص الكمية" }));
    expect(input.value).toBe("1.25");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input.value).toBe("2.25");
  });
  it("repeats while held and stops on release or cancellation", () => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", MouseEvent);
    render(createElement(Quantity));
    const up = screen.getByRole("button", { name: "زيادة الكمية" });
    const down = screen.getByRole("button", { name: "إنقاص الكمية" });
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    fireEvent.pointerDown(up, { button: 0 });
    act(() => {
      vi.advanceTimersByTime(650);
    });
    fireEvent.pointerUp(up);
    fireEvent.click(up, { detail: 1 });
    expect(input.value).toBe("1003");
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(input.value).toBe("1003");
    fireEvent.pointerDown(down, { button: 0 });
    fireEvent.blur(up, { relatedTarget: down });
    act(() => {
      vi.advanceTimersByTime(540);
    });
    fireEvent.pointerCancel(down);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(input.value).toBe("1001");
  });
});
describe("BOQ resource form", () => {
  it.each([1, 2, 3])(
    "shows unit and quantity only on a third-level item, editing level %s",
    (level) => {
      render(
        createElement(ResourceForm, {
          resource: "boq",
          initial: {
            id: "1",
            name: "بند",
            level,
            unit_name: "متر",
            quantity: "1000.000",
          },
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: ar.common.edit }));
      const quantity = screen.queryByRole("spinbutton", {
        name: ar.fields.quantity,
      }) as HTMLInputElement | null;
      if (level === 3) {
        expect(screen.getByText(ar.fields.unit)).toBeTruthy();
        expect(quantity?.value).toBe("1000");
      } else {
        expect(screen.queryByText(ar.fields.unit)).toBeNull();
        expect(quantity).toBeNull();
      }
    },
  );
});
describe("Request approval controls", () => {
  const props = { actor: { is_owner: true } as Actor, lines: [], quotes: [] };
  it.each([
    [1, ar.common.approve],
    [9, ar.common.approve],
    [10, "اعتماد التسعير"],
    [11, ar.common.order],
    [5, ar.common.finish],
    [2, "تسجيل عروض الأسعار"],
  ] as const)(
    "switches the action for a pending overage in stage %s",
    (status, ordinary) => {
      const request = { id: "1", status, version: 1 };
      const { rerender } = render(
        createElement(RequestActions, {
          ...props,
          request,
          pendingOverage: true,
        }),
      );
      expect(
        screen.getByRole("button", { name: ar.common.approveOverage }),
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: ordinary })).toBeNull();
      rerender(
        createElement(RequestActions, {
          ...props,
          request,
          pendingOverage: false,
        }),
      );
      expect(
        screen.queryByRole("button", { name: ar.common.approveOverage }),
      ).toBeNull();
      expect(screen.getByRole("button", { name: ordinary })).toBeTruthy();
    },
  );
});
