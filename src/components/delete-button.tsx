"use client";
import { useLanguage } from "@/components/language-context";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button, Modal, Message, command } from "./ui";
export default function DeleteButton({
  resource,
  id,
}: {
  resource: string;
  id: string;
}) {
  const { m: msg } = useLanguage();
  
  const router = useRouter(),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={msg.common.confirmDelete}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          intent="red"
          className="small icon"
          aria-label={msg.common.delete}
        >
          <Trash2 size={14} />
        </Button>
      }
    >
      <div className="stack">
        <Message error={error} />
        <div className="row end">
          <Button onClick={() => setOpen(false)}>{msg.common.cancel}</Button>
          <Button
            intent="red"
            pending={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await command("delete", { resource, id });
                setOpen(false);
                router.refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {msg.common.delete}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
