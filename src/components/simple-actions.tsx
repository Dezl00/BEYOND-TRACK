"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { ar } from "@/messages/ar";
import { Button, command, Message } from "./ui";
export function NotificationRead({ id }: { id?: string }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  async function read() {
    setBusy(true);
    setDone(true);
    try {
      await command("notification-read", id ? { id } : {});
      router.refresh();
    } catch (e) {
      setDone(false);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        className="small"
        disabled={done}
        pending={busy}
        onClick={() => void read()}
      >
        <Check size={14} />
        {id ? ar.common.markRead : ar.common.markAllRead}
      </Button>
      <Message error={error} />
    </>
  );
}
export function Revoke({ id }: { id: string }) {
  const router = useRouter(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <Button
        intent="red"
        className="small"
        pending={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await command("revoke-session", { id });
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {ar.auth.revoke}
      </Button>
      <Message error={error} />
    </>
  );
}
