"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Mail } from "lucide-react";
import { ar } from "@/messages/ar";
import { purgeConfirmSchema } from "@/lib/validation";
import { Button, Checkbox, Field, Message, Modal, command } from "./ui";

export default function RequestPurge({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [ack, setAck] = useState(false),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  function close(value: boolean) {
    if (busy) return;
    setOpen(value);
    setError("");
    if (!value) {
      setChallenge("");
      setCode("");
      setAck(false);
    }
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ack || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (!challenge) {
        const result = (await command("request-purge-code", {})) as {
          challenge: string;
        };
        setChallenge(result.challenge);
      } else {
        await command(
          "request-purge-confirm",
          purgeConfirmSchema.parse({ challenge, code }),
        );
        setOpen(false);
        setChallenge("");
        setCode("");
        setAck(false);
        setSuccess(ar.settings.purgeDone);
        router.refresh();
      }
    } catch (e) {
      setError(
        "issues" in (e as object) ? ar.errors.otp : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{ar.settings.purge}</h2>
      </div>
      <div className="panel-body stack">
        <Message success={success} />
        <div>
          <Button intent="red" onClick={() => close(true)}>
            <Trash2 size={16} />
            {ar.settings.purge}
          </Button>
        </div>
      </div>
      <Modal title={ar.settings.purge} open={open} onOpenChange={close}>
        <form className="stack" onSubmit={submit} noValidate>
          <div className="confirmation-icon">
            <Trash2 size={25} />
          </div>
          <Field label={ar.settings.purgeEmail}>
            <bdi className="purge-email">
              <Mail size={15} />
              {email}
            </bdi>
          </Field>
          <Message error={error} />
          <Checkbox
            label={ar.settings.purgeConfirm}
            checked={ack}
            disabled={!!challenge || busy}
            onChange={(event) => setAck(event.target.checked)}
          />
          {challenge ? (
            <Field label={ar.settings.purgeCode}>
              <input
                autoFocus
                className="input numeric otp-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/g, ""))
                }
              />
            </Field>
          ) : null}
          <div className="confirmation-actions">
            <Button type="button" disabled={busy} onClick={() => close(false)}>
              {ar.common.cancel}
            </Button>
            <Button
              type="submit"
              intent="red"
              pending={busy}
              disabled={!ack || (!!challenge && code.length !== 6)}
            >
              {challenge ? ar.common.delete : ar.settings.purgeSend}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
