"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { ar } from "@/messages/ar";

const LoginReady = createContext<() => void>(() => {});
export function useLoginReady() {
  const ready = useContext(LoginReady);
  useEffect(() => ready(), [ready]);
}

function waitForImage(image: HTMLImageElement, signal: AbortSignal) {
  if (image.complete) return Promise.resolve();
  return new Promise<void>((resolve) => {
    function done() {
      image.removeEventListener("load", done);
      image.removeEventListener("error", done);
      signal.removeEventListener("abort", done);
      resolve();
    }
    image.addEventListener("load", done, { once: true });
    image.addEventListener("error", done, { once: true });
    signal.addEventListener("abort", done, { once: true });
  });
}
export default function LoginEntry({
  children,
}: {
  children: React.ReactNode;
}) {
  const [formReady, setFormReady] = useState(false),
    [assetsReady, setAssetsReady] = useState(false),
    [elapsed, setElapsed] = useState(false),
    [exiting, setExiting] = useState(false),
    [visible, setVisible] = useState(true);
  const ready = useCallback(() => setFormReady(true), []);

  useEffect(() => {
    // Include navigation/hydration time in the 1.5s normal entry budget.
    // Leave 180ms for the fade, and wait longer only for the actual login assets.
    const timer = setTimeout(
      () => setElapsed(true),
      Math.max(0, 1320 - performance.now()),
    );
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!formReady) return;
    const controller = new AbortController();
    const images = Array.from(
      document.querySelectorAll<HTMLImageElement>(".login-box .brand-image"),
    );
    void Promise.allSettled([
      document.fonts?.ready ?? Promise.resolve(),
      ...images.map((image) => waitForImage(image, controller.signal)),
    ]).then(() => {
      if (!controller.signal.aborted) setAssetsReady(true);
    });
    return () => controller.abort();
  }, [formReady]);
  useEffect(() => {
    if (!elapsed || !assetsReady) return;
    setExiting(true);
    const timer = setTimeout(() => setVisible(false), 180);
    return () => clearTimeout(timer);
  }, [elapsed, assetsReady]);
  return (
    <LoginReady.Provider value={ready}>
      {visible ? (
        <div
          className="entry-splash"
          role="status"
          aria-label={ar.brand}
          data-exiting={exiting}
        >
          <div className="entry-splash-mark" aria-hidden="true">
            <svg
              className="entry-splash-rings"
              viewBox="0 0 160 160"
              fill="none"
            >
              <circle
                className="entry-splash-ring outer"
                cx="80"
                cy="80"
                r="67"
                strokeWidth="1.5"
                strokeDasharray="285 136"
                strokeLinecap="round"
              />
              <circle
                className="entry-splash-ring inner"
                cx="80"
                cy="80"
                r="54"
                strokeWidth="1.5"
                strokeDasharray="210 130"
                strokeLinecap="round"
              />
            </svg>
            <img
              src="/icon.svg"
              width="46"
              height="52"
              alt=""
              fetchPriority="high"
            />
          </div>
        </div>
      ) : null}
      <div
        className="login-entry-content"
        inert={visible}
        aria-hidden={visible || undefined}
      >
        {children}
      </div>
    </LoginReady.Provider>
  );
}
