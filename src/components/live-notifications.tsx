"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  startTransition,
} from "react";
import { Bell, CheckCheck } from "lucide-react";
import { ar } from "@/messages/ar";
import { date, number, requestCode } from "@/lib/format";
import { useDigits } from "./format-context";
import { Button, command } from "./form-controls";
type Snapshot = {
  revision: string;
  unread: number;
  items: {
    id: string;
    type: number;
    request_id: string;
    number: number;
    created_at: string;
    read_at: string | null;
  }[];
};
export default function LiveNotifications() {
  const router = useRouter(),
    path = usePathname(),
    params = useSearchParams(),
    digits = useDigits();
  const project = params.get("project") || "";
  const [open, setOpen] = useState(false),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    revision = useRef<string | null>(null),
    busy = useRef(false);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (busy.current || document.visibilityState === "hidden") return;
      busy.current = true;
      try {
        const response = await fetch(
          `/api/live${project ? `?project=${project}` : ""}`,
          { signal, cache: "no-store" },
        );
        if (response.status === 401) {
          window.location.replace("/login");
          return;
        }
        if (!response.ok) return;
        const data: Snapshot = await response.json();
        setSnapshot(data);
        if (revision.current && revision.current !== data.revision) {
          // Keep in-progress forms and dialogs intact. A later poll applies the
          // update once the user leaves the field or closes the dialog.
          if (
            document.querySelector('[role="dialog"]') ||
            ["INPUT", "TEXTAREA"].includes(
              document.activeElement?.tagName || "",
            )
          )
            return;
          startTransition(() => router.refresh());
        }
        revision.current = data.revision;
      } catch (e) {
        if ((e as Error).name !== "AbortError") setError("");
      } finally {
        busy.current = false;
      }
    },
    [project, router],
  );
  useEffect(() => {
    revision.current = null;
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), 5000);
    const update = () => void refresh(controller.signal);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("siteflow-update", update);
    const worker = () => update();
    navigator.serviceWorker?.addEventListener("message", worker);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("siteflow-update", update);
      navigator.serviceWorker?.removeEventListener("message", worker);
    };
  }, [refresh, path]);
  useEffect(() => {
    if (!open) return;
    void refresh();
    const dismiss = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", key);
    };
  }, [open, refresh]);
  async function markRead(id?: string) {
    const previous = snapshot;
    setSnapshot((current) =>
      current
        ? {
            ...current,
            unread: id
              ? Math.max(
                  0,
                  current.unread -
                    (current.items.find((x) => x.id === id)?.read_at ? 0 : 1),
                )
              : 0,
            items: current.items.map((x) =>
              !id || x.id === id
                ? { ...x, read_at: new Date().toISOString() }
                : x,
            ),
          }
        : current,
    );
    try {
      await command("notification-read", id ? { id } : {});
      void refresh();
    } catch (e) {
      setSnapshot(previous);
      setError((e as Error).message);
    }
  }
  return (
    <div className="notification-center" ref={box}>
      <button
        ref={trigger}
        className="notification-bell"
        type="button"
        aria-label={`${ar.nav.notifications}${snapshot?.unread ? ` · ${number(snapshot.unread, digits, 0)} ${ar.live.unread}` : ""}`}
        aria-expanded={open}
        aria-controls="notification-popover"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={21} strokeWidth={1.55} />
        {snapshot?.unread ? (
          <span className="notification-count">
            {number(Math.min(99, snapshot.unread), digits, 0)}
          </span>
        ) : null}
      </button>
      {open ? (
        <section
          className="notification-popover"
          id="notification-popover"
          aria-label={ar.nav.notifications}
        >
          <div className="notification-heading">
            <h2>{ar.nav.notifications}</h2>
            {snapshot?.unread ? (
              <Button
                className="icon small"
                aria-label={ar.common.markAllRead}
                onClick={() => void markRead()}
              >
                <CheckCheck size={18} />
              </Button>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="error-message">
              {error}
            </p>
          ) : null}
          <div className="notification-items">
            {!snapshot ? (
              <div className="notification-placeholder" aria-busy="true">
                <span className="skeleton" />
                <span className="skeleton" />
                <span className="skeleton" />
              </div>
            ) : snapshot.items.length ? (
              snapshot.items.map((item) => (
                <Link
                  key={item.id}
                  href={`/requests/${item.request_id}`}
                  className={`notification-item ${!item.read_at ? "unread" : ""}`}
                  onClick={() => {
                    setOpen(false);
                    if (!item.read_at) void markRead(item.id);
                  }}
                >
                  <span className="notification-dot" />
                  <span>
                    <strong>{ar.notificationTypes[item.type]}</strong>
                    <bdi className="code">{requestCode(item.number)}</bdi>
                    <time>{date(item.created_at, digits, true)}</time>
                  </span>
                </Link>
              ))
            ) : (
              <div className="empty">{ar.common.empty}</div>
            )}
          </div>
          <Link
            href="/notifications"
            className="notification-all"
            onClick={() => setOpen(false)}
          >
            {ar.live.all}
          </Link>
        </section>
      ) : null}
    </div>
  );
}
