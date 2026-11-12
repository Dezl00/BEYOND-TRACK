"use client";
import { useLanguage } from "@/components/language-context";

import { useEffect, useState } from "react";

import { Checkbox, Message } from "./form-controls";
export default function PushSettings() {
  const { m: msg } = useLanguage();
  
  const [enabled, setEnabled] = useState(false),
    [available, setAvailable] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    )
      return;
    setAvailable(true);
    void navigator.serviceWorker
      .getRegistration("/")
      .then((registration) => registration?.pushManager.getSubscription())
      .then((value) => setEnabled(!!value));
  }, []);
  async function toggle(value: boolean) {
    if (busy) return;
    setBusy(true);
    setError("");
    setEnabled(value);
    try {
      if (value && (await Notification.requestPermission()) !== "granted")
        throw new Error(msg.live.denied);
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (value) {
        const response = await fetch("/api/push");
        const data = await response.json();
        if (!response.ok || !data.publicKey)
          throw new Error(msg.errors.configured);
        if (!subscription) {
          const raw = atob(
            data.publicKey.replace(/-/g, "+").replace(/_/g, "/"),
          );
          const key = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) key[i] = raw.charCodeAt(i);
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          });
        }
        const saved = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription.toJSON()),
        });
        if (!saved.ok) throw new Error((await saved.json()).error);
      } else if (subscription) {
        const response = await fetch("/api/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error((await response.json()).error);
        await subscription.unsubscribe();
      }
    } catch (e) {
      setEnabled(!value);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <Checkbox
        label={msg.live.push}
        checked={enabled}
        disabled={!available || busy}
        onChange={(e) => void toggle(e.target.checked)}
      />
      <Message error={error} />
      {!available ? <span className="muted">{msg.live.unavailable}</span> : null}
    </div>
  );
}
