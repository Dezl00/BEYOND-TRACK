"use client";
import { useState } from "react";
import { ar } from "@/messages/ar";
import { date } from "@/lib/format";
import { Modal, Button, Message, command } from "./ui";
import { useDigits } from "./format-context";
type Session = {
  id: string;
  ip: string;
  user_agent: string;
  expires_at: string;
};
export default function UserSessions({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<Session[]>([]),
    [next, setNext] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    digits = useDigits();
  async function load(cursor?: string) {
    setBusy(true);
    try {
      const r = await fetch(
          `/api/users/${userId}/sessions${cursor ? `?cursor=${cursor}` : ""}`,
        ),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setItems((prev) => (cursor ? [...prev, ...data.items] : data.items));
      setNext(data.next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={ar.auth.sessions}
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (value) void load();
      }}
      trigger={<Button className="small">{ar.auth.sessions}</Button>}
    >
      <div className="stack">
        <Message error={error} />
        {items.map((s) => (
          <div className="panel panel-body stack" key={s.id}>
            <bdi className="break">{s.user_agent}</bdi>
            <div className="row between">
              <bdi className="code">{s.ip}</bdi>
              <span>{date(s.expires_at, digits, true)}</span>
              <Button
                intent="red"
                className="small"
                onClick={async () => {
                  try {
                    await command("revoke-session", { id: s.id });
                    setItems((prev) => prev.filter((x) => x.id !== s.id));
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {ar.auth.revoke}
              </Button>
            </div>
          </div>
        ))}
        {next ? (
          <Button pending={busy} onClick={() => void load(next)}>
            {ar.common.more}
          </Button>
        ) : !items.length ? (
          <p className="muted">{busy ? ar.common.loading : ar.common.empty}</p>
        ) : null}
      </div>
    </Modal>
  );
}
