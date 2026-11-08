// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { PreferencesForm, SystemSettings } from "@/components/settings-form";
import ResourceForm from "@/components/resource-form";
import { ar } from "@/messages/ar";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const policies = [0, 1, 2].map((type) => ({
  type,
  in_app: true,
  email: true,
  whatsapp: true,
  forced: type === 1,
}));
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items: [], next: null })),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WhatsApp account controls", () => {
  it("saves WhatsApp preferences independently and disables mandatory switches", async () => {
    render(
      createElement(PreferencesForm, {
        theme: 0,
        otpEnabled: false,
        otpRequired: false,
        policies,
        prefs: [],
        tab: "notifications",
      }),
    );
    const toggle = screen.getByRole("switch", {
      name: `${ar.settings.whatsapp} · ${ar.notificationTypes[0]}`,
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(
      (
        screen.getByRole("switch", {
          name: `${ar.settings.whatsapp} · ${ar.notificationTypes[1]}`,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.command).toBe("preferences");
    expect(body.data.preferences[0]).toEqual({
      type: 0,
      inApp: true,
      email: true,
      whatsapp: false,
    });
  });
  it("saves the global WhatsApp switch", async () => {
    render(
      createElement(SystemSettings, {
        settings: {
          otp_required: false,
          default_theme: 0,
          digits: 0,
          read_notification_days: 30,
          whatsapp_enabled: true,
        },
        policies,
        owner: true,
      }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: ar.whatsapp.enableSystem }),
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(body.command).toBe("settings");
    expect(body.data.whatsappEnabled).toBe(false);
  });
  it("keeps the local number separate from the country code when editing users", () => {
    render(
      createElement(ResourceForm, {
        resource: "user",
        actor: { is_owner: true },
        initial: {
          id: "11111111-1111-4111-8111-111111111111",
          whatsapp_country_code: "+20",
          whatsapp_number: "1144797501",
          whatsapp_enabled: true,
        },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: ar.common.edit }));
    const phone = screen.getByRole("textbox", {
      name: new RegExp(ar.whatsapp.number),
    }) as HTMLInputElement;
    expect(phone.value).toBe("1144797501");
    expect(phone.type).toBe("tel");
    expect(screen.getByText(ar.whatsapp.egypt)).toBeTruthy();
    expect(
      screen
        .getByRole("switch", { name: ar.whatsapp.enableAccount })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });
});
