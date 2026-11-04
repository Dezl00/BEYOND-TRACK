"use client";
import { createContext, useContext, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Download, Share2, PlusSquare, Menu } from "lucide-react";
import { ar } from "@/messages/ar";
import { Button, Message } from "./form-controls";
const Modal = dynamic(() => import("./ui").then((module) => module.Modal));
type InstallEvent = Event & {
  prompt: () => Promise<{ outcome: "accepted" | "dismissed" }>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
const InstallContext = createContext<{
  installed: boolean;
  ready: boolean;
  ios: boolean;
  prompt: InstallEvent | null;
  consumed: () => void;
}>({
  installed: false,
  ready: false,
  ios: false,
  prompt: null,
  consumed: () => {},
});
export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null),
    [installed, setInstalled] = useState(false),
    [ready, setReady] = useState(false),
    [ios, setIos] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)");
    function update() {
      setInstalled(
        standalone.matches ||
          !!(navigator as Navigator & { standalone?: boolean }).standalone,
      );
    }
    function capture(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallEvent);
    }
    function complete() {
      setInstalled(true);
      setPrompt(null);
    }
    update();
    setReady(true);
    setIos(
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
    );
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    standalone.addEventListener("change", update);
    let current = true;
    let registration: ServiceWorkerRegistration | undefined;
    if ("serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .then((value) => {
          if (current) registration = value;
        })
        .catch(() => {});
    }
    function refresh() {
      if (document.visibilityState === "visible")
        void registration?.update().catch(() => {});
    }
    document.addEventListener("visibilitychange", refresh);
    return () => {
      current = false;
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
      standalone.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return (
    <InstallContext.Provider
      value={{ installed, ready, ios, prompt, consumed: () => setPrompt(null) }}
    >
      {children}
    </InstallContext.Provider>
  );
}
export function InstallApp({ className = "" }: { className?: string }) {
  const state = useContext(InstallContext),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!state.ready || state.installed) return null;
  async function install() {
    if (!state.prompt) {
      setOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await state.prompt.prompt();
      await state.prompt.userChoice;
      state.consumed();
    } catch {
      setError(ar.common.failed);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        className={`install-app ${className}`}
        pending={busy}
        onClick={() => void install()}
      >
        <Download size={17} />
        {ar.pwa.install}
      </Button>
      <Message error={error} />
      {open ? (
        <Modal title={ar.pwa.installTitle} open={open} onOpenChange={setOpen}>
          <div className="stack install-options">
            <div>
              {state.ios ? <Share2 size={21} /> : <Menu size={21} />}
              <span>{state.ios ? ar.pwa.share : ar.pwa.browserMenu}</span>
            </div>
            <div>
              <PlusSquare size={21} />
              <span>{state.ios ? ar.pwa.addHome : ar.pwa.installMenu}</span>
            </div>
            <Button onClick={() => setOpen(false)}>{ar.common.close}</Button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
