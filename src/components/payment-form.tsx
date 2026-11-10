"use client";
import { useEffect, useState } from "react";
import { orderSchema } from "@/lib/validation";
import { ar } from "@/messages/ar";
import type { Quote } from "@/lib/quotations";
import StageAttachments, { type UploadState } from "./stage-attachments";
import { QuoteSummary, type RequestLine } from "./quotation-editor";
import { Button, Message, command } from "./ui";
export default function PaymentForm({
  request,
  quotes,
  lines,
  onDone,
  onBusyChange,
}: {
  request: { id: string; version: number };
  quotes: Quote[];
  lines: RequestLine[];
  onDone: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [key] = useState(() => crypto.randomUUID()),
    [files, setFiles] = useState<UploadState>({
      ids: [],
      ready: false,
      uploading: false,
    });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    onBusyChange(busy || files.uploading);
    return () => onBusyChange(false);
  }, [busy, files.uploading, onBusyChange]);
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !files.ready || !files.ids.length) return;
    setBusy(true);
    setError("");
    try {
      await command(
        "order",
        orderSchema.parse({
          id: request.id,
          version: request.version,
          key,
          attachmentIds: files.ids,
        }),
      );
      onDone();
    } catch (error) {
      setError(
        error instanceof Error && !("issues" in error)
          ? error.message
          : ar.errors.invalid,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Message error={error} />
      <QuoteSummary quotes={quotes.filter((q) => q.selected)} lines={lines} />
      <StageAttachments
        requestId={request.id}
        uploadKey={key}
        purpose="payment"
        label="إيصال الدفع"
        onChange={setFiles}
        disabled={busy}
      />
      <div className="form-footer">
        <Button
          type="button"
          onClick={onDone}
          disabled={busy || files.uploading}
        >
          إلغاء
        </Button>
        <Button
          type="submit"
          intent="green"
          pending={busy}
          disabled={!files.ready || !files.ids.length}
        >
          تأكيد الدفع
        </Button>
      </div>
    </form>
  );
}
