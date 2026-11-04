"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { ar } from "@/messages/ar";
import { Button, Modal, Message, command } from "./ui";
export default function DeleteButton({
  resource,
  id,
}: {
  resource: string;
  id: string;
}) {
  const router = useRouter(),
    [open, setOpen] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={ar.common.confirmDelete}
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          intent="red"
          className="small icon"
          aria-label={ar.common.delete}
        >
          <Trash2 size={14} />
        </Button>
      }
    >
      <div className="stack">
        <Message error={error} />
        <div className="row end">
          <Button onClick={() => setOpen(false)}>{ar.common.cancel}</Button>
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
            {ar.common.delete}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
