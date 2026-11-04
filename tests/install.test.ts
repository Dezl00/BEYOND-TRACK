// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstallApp, PwaProvider } from "@/components/pwa";
import { ar } from "@/messages/ar";
let register: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal("isSecureContext", true);
  register = vi.fn(async () => ({ update: vi.fn(async () => {}) }));
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register },
  });
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "Desktop Browser",
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const App = () => createElement(PwaProvider, null, createElement(InstallApp));
describe("PWA installation controls", () => {
  it("registers the worker without requesting notification permission and consumes the native prompt only once", async () => {
    const user = userEvent.setup();
    render(createElement(App));
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith("/sw.js", {
        scope: "/",
        updateViaCache: "none",
      }),
    );
    const prompt = vi.fn(async () => ({ outcome: "dismissed" }));
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);
    await user.click(screen.getByRole("button", { name: ar.pwa.install }));
    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole("button", { name: ar.pwa.install }));
    expect(
      await screen.findByRole("dialog", { name: ar.pwa.installTitle }),
    ).toBeTruthy();
    expect(prompt).toHaveBeenCalledTimes(1);
  });
  it("hides installation controls in standalone mode and after installation", async () => {
    render(createElement(App));
    expect(screen.getByRole("button", { name: ar.pwa.install })).toBeTruthy();
    fireEvent(window, new Event("appinstalled"));
    expect(screen.queryByRole("button", { name: ar.pwa.install })).toBeNull();
  });
  it("offers iPhone share and add-to-home-screen actions when no native prompt exists", async () => {
    Object.defineProperty(navigator, "userAgent", {
      configurable: true,
      value: "iPhone",
    });
    const user = userEvent.setup();
    render(createElement(App));
    await user.click(screen.getByRole("button", { name: ar.pwa.install }));
    await screen.findByRole("dialog", { name: ar.pwa.installTitle });
    expect(screen.getByText(ar.pwa.share)).toBeTruthy();
    expect(screen.getByText(ar.pwa.addHome)).toBeTruthy();
    expect(screen.queryByText(ar.pwa.browserMenu)).toBeNull();
    await user.click(screen.getByText(ar.common.close));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
