// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import LoginEntry, { useLoginReady } from "@/components/login-entry";

function ReadyForm() {
  useLoginReady();
  return createElement(
    "div",
    { className: "login-box" },
    createElement("img", {
      src: "/logo.svg",
      alt: "شعار",
      className: "brand-image",
    }),
    createElement("button", null, "دخول"),
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe("Login entry splash", () => {
  it("covers the rendered login and fades out within 1.5s on a ready connection", async () => {
    render(createElement(LoginEntry, null, createElement(ReadyForm)));
    await act(async () => {});
    const splash = screen.getByRole("status");
    expect(
      document
        .querySelector(".login-entry-content")
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(screen.queryByRole("button", { name: "دخول" })).toBeNull();
    expect(splash.querySelectorAll("circle")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(1319));
    expect(splash.getAttribute("data-exiting")).toBe("false");
    act(() => vi.advanceTimersByTime(1));
    expect(splash.getAttribute("data-exiting")).toBe("true");
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "دخول" })).toBeTruthy();
  });
  it("stays beyond two seconds for slow font loading and closes when ready", async () => {
    let complete!: () => void;
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: {
        ready: new Promise<void>((resolve) => {
          complete = resolve;
        }),
      },
    });
    render(createElement(LoginEntry, null, createElement(ReadyForm)));
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.getByRole("status").getAttribute("data-exiting")).toBe(
      "false",
    );
    await act(async () => {
      complete();
    });
    expect(screen.getByRole("status").getAttribute("data-exiting")).toBe(
      "true",
    );
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("waits for the actual login logo, accepts an image error, and never traps the form", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      false,
    );
    render(createElement(LoginEntry, null, createElement(ReadyForm)));
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.getByRole("status").getAttribute("data-exiting")).toBe(
      "false",
    );
    await act(async () => {
      fireEvent.error(document.querySelector(".brand-image")!);
    });
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "دخول" })).toBeTruthy();
  });
  it("does not add another 1.5s after a slow navigation and cleans up timers", async () => {
    vi.spyOn(performance, "now").mockReturnValue(2200);
    const view = render(
      createElement(LoginEntry, null, createElement(ReadyForm)),
    );
    await act(async () => {});
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole("status").getAttribute("data-exiting")).toBe(
      "true",
    );
    act(() => vi.advanceTimersByTime(180));
    expect(screen.queryByRole("status")).toBeNull();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
