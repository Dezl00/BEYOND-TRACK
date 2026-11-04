// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginForm from "@/components/login-form";
import LoginShowcase from "@/components/login-showcase";
import { ar } from "@/messages/ar";

const state = vi.hoisted(() => ({ params: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.params),
}));
beforeEach(() => {
  state.params = "";
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal("fetch", vi.fn());
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: false,
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("Login workflow carousel", () => {
  it("advances without replacing the form, pauses on hover and hidden tabs, and resumes", () => {
    vi.useFakeTimers();
    render(
      createElement(
        "div",
        null,
        createElement(LoginForm),
        createElement(LoginShowcase),
      ),
    );
    const identifier = screen.getByRole("textbox", {
      name: ar.auth.identifier,
    }) as HTMLInputElement;
    fireEvent.change(identifier, { target: { value: "engineer@example.com" } });
    act(() => identifier.focus());
    act(() => vi.advanceTimersByTime(6500));
    expect(
      screen.getByRole("group", { name: ar.loginStory.steps[1].title }),
    ).toBeTruthy();
    expect(identifier.value).toBe("engineer@example.com");
    expect(document.activeElement).toBe(identifier);
    const carousel = screen.getByRole("region", { name: ar.loginStory.title });
    fireEvent.mouseEnter(carousel);
    act(() => vi.advanceTimersByTime(13000));
    expect(
      screen.getByRole("group", { name: ar.loginStory.steps[1].title }),
    ).toBeTruthy();
    fireEvent.mouseLeave(carousel);
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(13000));
    expect(
      screen.getByRole("group", { name: ar.loginStory.steps[1].title }),
    ).toBeTruthy();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: false,
    });
    fireEvent(document, new Event("visibilitychange"));
    act(() => vi.advanceTimersByTime(6500));
    expect(
      screen.getByRole("group", { name: ar.loginStory.steps[2].title }),
    ).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("supports RTL keyboard navigation, direct selection, and explicit pause", () => {
    vi.useFakeTimers();
    render(createElement(LoginShowcase));
    fireEvent.click(screen.getByRole("button", { name: ar.loginStory.pause }));
    act(() => vi.advanceTimersByTime(13000));
    expect(
      screen.getByRole("group", { name: ar.loginStory.steps[0].title }),
    ).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("region"), { key: "ArrowLeft" });
    expect(
      screen.getByRole("group", { name: ar.loginStory.steps[1].title }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: ar.loginStory.steps[2].title }),
    );
    expect(
      screen
        .getByRole("button", { name: ar.loginStory.steps[2].title })
        .getAttribute("aria-current"),
    ).toBe("step");
    act(() => vi.advanceTimersByTime(13000));
    expect(
      screen.getByRole("group", { name: ar.loginStory.steps[2].title }),
    ).toBeTruthy();
  });
  it("disables automatic motion on small screens and for reduced-motion preferences", () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    render(createElement(LoginShowcase));
    act(() => vi.advanceTimersByTime(20000));
    expect(
      screen.getByRole("group", { name: ar.loginStory.steps[0].title }),
    ).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: ar.loginStory.play,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
describe("Login, OTP, and recovery forms", () => {
  it("retains entered credentials when revealing the password and progresses through OTP", async () => {
    const user = userEvent.setup(),
      challenge = "11111111-1111-4111-8111-111111111111";
    const request = vi.mocked(fetch);
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ challenge }), { status: 200 }),
    );
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: ar.errors.otp }), { status: 400 }),
    );
    render(createElement(LoginForm));
    await user.type(
      screen.getByRole("textbox", { name: ar.auth.identifier }),
      "engineer@example.com",
    );
    const password = screen.getByLabelText(
      ar.auth.password,
    ) as HTMLInputElement;
    await user.type(password, "Password-12345");
    await user.click(
      screen.getByRole("button", { name: ar.auth.showPassword }),
    );
    expect(password.type).toBe("text");
    expect(password.value).toBe("Password-12345");
    await user.click(
      screen.getByRole("button", { name: ar.auth.hidePassword }),
    );
    expect(password.type).toBe("password");
    await user.click(screen.getByRole("button", { name: ar.auth.login }));
    await screen.findByRole("heading", { name: ar.auth.otp });
    expect(request.mock.calls[0][0]).toBe("/api/auth/login");
    expect(JSON.parse(request.mock.calls[0][1]!.body as string)).toEqual({
      identifier: "engineer@example.com",
      password: "Password-12345",
      remember: false,
    });
    await user.type(
      screen.getByRole("textbox", { name: ar.auth.otp }),
      "123456",
    );
    await user.click(screen.getByRole("button", { name: ar.auth.verify }));
    await screen.findByRole("alert");
    expect(JSON.parse(request.mock.calls[1][1]!.body as string)).toEqual({
      challenge,
      code: "123456",
    });
    expect(screen.getByRole("heading", { name: ar.auth.otp })).toBeTruthy();
  });
  it("keeps the forgot-password response neutral and returns to login", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: ar.auth.resetSent }), {
        status: 200,
      }),
    );
    render(createElement(LoginForm));
    await user.click(screen.getByRole("button", { name: ar.auth.forgot }));
    await user.type(
      screen.getByRole("textbox", { name: ar.auth.email }),
      "engineer@example.com",
    );
    await user.click(screen.getByRole("button", { name: ar.auth.sendReset }));
    await screen.findByText(ar.auth.resetSent);
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/auth/forgot");
    await user.click(screen.getByRole("button", { name: ar.auth.returnLogin }));
    expect(screen.getByRole("heading", { name: ar.auth.title })).toBeTruthy();
  });
  it("validates password confirmation before submitting a reset token", async () => {
    state.params = "reset=" + "a".repeat(64);
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: ar.auth.resetDone }), {
        status: 200,
      }),
    );
    vi.spyOn(history, "replaceState").mockImplementation(() => {});
    render(createElement(LoginForm));
    await user.type(
      screen.getByLabelText(ar.auth.newPassword),
      "Password-12345",
    );
    await user.type(
      screen.getByLabelText(ar.auth.confirmPassword),
      "Different-12345",
    );
    await user.click(
      screen.getByRole("button", { name: ar.auth.changePassword }),
    );
    expect(screen.getByRole("alert").textContent).toBe(ar.errors.passwordMatch);
    expect(fetch).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText(ar.auth.confirmPassword));
    await user.type(
      screen.getByLabelText(ar.auth.confirmPassword),
      "Password-12345",
    );
    await user.click(
      screen.getByRole("button", { name: ar.auth.changePassword }),
    );
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: ar.auth.title })).toBeTruthy(),
    );
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/auth/reset");
    expect(history.replaceState).toHaveBeenCalledWith(null, "", "/login");
  });
});
