"use client";
import { useLanguage } from "@/components/language-context";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Mail } from "lucide-react";

import { purgeConfirmSchema } from "@/lib/validation";
import { Button, Checkbox, Field, Lookup, Message, Modal, command } from "./ui";

export default function RequestPurge({
  email,
  project,
}: {
  email: string;
  project?: { id: string; name: string };
}) {
  const { m: msg } = useLanguage();
  
  const title = project ? msg.interface.deleteProject + " " + project.name : msg.settings.purge;
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [ack, setAck] = useState(false),
    [projectId, setProjectId] = useState(""),
    [challenge, setChallenge] = useState(""),
    [code, setCode] = useState(""),
    [whatsapp, setWhatsapp] = useState(false),
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
        const result = (await command(
          project ? "project-delete-code" : "request-purge-code",
          project ? { projectId: project.id } : projectId ? { projectId } : {},
        )) as {
          challenge: string;
          whatsapp: boolean;
        };
        setWhatsapp(result.whatsapp);
        setChallenge(result.challenge);
      } else {
        await command(
          project ? "project-delete-confirm" : "request-purge-confirm",
          {
            ...purgeConfirmSchema.parse({ challenge, code }),
            ...(project
              ? { projectId: project.id }
              : projectId
                ? { projectId }
                : {}),
          },
        );
        setOpen(false);
        setChallenge("");
        setCode("");
        setAck(false);
        setSuccess(project ? msg.interface.deletedProject : msg.settings.purgeDone);
        if (
          project &&
          new URLSearchParams(window.location.search).get("project") ===
            project.id
        )
          router.replace("/projects");
        router.refresh();
      }
    } catch (e) {
      setError(
        "issues" in (e as object) ? msg.errors.otp : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {project ? (
        <Button
          className="icon small"
          intent="red"
          aria-label={title}
          title={title}
          onClick={() => close(true)}
        >
          <Trash2 size={16} />
        </Button>
      ) : (
        <section className="panel">
          <div className="panel-heading">
            <h2>{msg.settings.purge}</h2>
          </div>
          <div className="panel-body stack">
            <Message success={success} />
            <div>
              <Button intent="red" onClick={() => close(true)}>
                <Trash2 size={16} />
                {msg.settings.purge}
              </Button>
            </div>
          </div>
        </section>
      )}
      <Modal title={title} open={open} onOpenChange={close}>
        <form className="stack" onSubmit={submit} noValidate>
          <div className="confirmation-icon">
            <Trash2 size={25} />
          </div>
          <Field label={msg.settings.purgeEmail}>
            <bdi className="purge-email">
              <Mail size={15} />
              {email}
            </bdi>
          </Field>
          <Message
            error={error}
            success={
              challenge
                ? whatsapp
                  ? msg.auth.otpBoth
                  : msg.auth.otpSent
                : undefined
            }
          />
          {!project ? (
            <Field label={msg.settings.purgeProject}>
              <Lookup
                resource="projects"
                value={projectId}
                allowNone
                allLabel={msg.common.allProjects}
                includeInactive
                disabled={!!challenge || busy}
                onChange={(value) => {
                  setProjectId(value);
                  setAck(false);
                }}
              />
            </Field>
          ) : null}
          {!project ? <small>{msg.settings.purgeSequenceHint}</small> : null}
          <Checkbox
            label={
              project
                ? msg.interface.confirmDeleteProject.replace("{name}", project.name)
                : projectId
                  ? msg.settings.purgeProjectConfirm
                  : msg.settings.purgeConfirm
            }
            checked={ack}
            disabled={!!challenge || busy}
            onChange={(event) => setAck(event.target.checked)}
          />
          {challenge ? (
            <Field label={msg.settings.purgeCode}>
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
              {msg.common.cancel}
            </Button>
            <Button
              type="submit"
              intent="red"
              pending={busy}
              disabled={!ack || (!!challenge && code.length !== 6)}
            >
              {challenge ? msg.common.delete : msg.settings.purgeSend}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
