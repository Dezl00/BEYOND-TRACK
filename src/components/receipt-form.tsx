"use client";
import { NumberField } from "./number-field";
import { useEffect, useRef, useState } from "react";
import { Camera, Images, X, Check, RotateCw } from "lucide-react";
import { ar } from "@/messages/ar";
import { receiptSchema } from "@/lib/validation";
import {
  changeReceiptQuantity,
  remainingQuantity,
  receiptQuantityError,
  type ReceiptQuantities,
} from "@/lib/receiving";
import { number } from "@/lib/format";
import { useDigits } from "./format-context";
import type { RequestLine } from "./quotation-editor";
import { Button, Field, Message, command } from "./ui";
type UploadedFile = {
  key: string;
  file: File;
  id?: string;
  error?: string;
  uploading: boolean;
};
export default function ReceiptForm({
  requestId,
  lines,
  onDone,
  onBusyChange,
}: {
  requestId: string;
  lines: RequestLine[];
  onDone: () => void;
  onBusyChange?: (value: boolean) => void;
}) {
  const digits = useDigits(),
    camera = useRef<HTMLInputElement>(null),
    gallery = useRef<HTMLInputElement>(null);
  const [key] = useState(() => crypto.randomUUID());
  const [quantities, setQuantities] = useState<
    Record<string, ReceiptQuantities>
  >(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        {
          accepted: remainingQuantity(l.quantity, l.accepted, l.returned),
          damaged: "0",
          rejected: "0",
          returned: "0",
        },
      ]),
    ),
  );
  const [notes, setNotes] = useState(""),
    [files, setFiles] = useState<UploadedFile[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const uploadLock = useRef(false);
  const uploading = files.some((f) => f.uploading);
  const complete =
    files.length > 0 && files.every((f) => !!f.id && !f.uploading && !f.error);
  useEffect(() => {
    onBusyChange?.(busy || uploading);
    return () => onBusyChange?.(false);
  }, [busy, uploading, onBusyChange]);
  async function upload(item: UploadedFile) {
    setFiles((prev) =>
      prev.map((f) =>
        f.key === item.key ? { ...f, uploading: true, error: undefined } : f,
      ),
    );
    try {
      if (
        !item.file.size ||
        item.file.size > 4 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
          item.file.type,
        )
      )
        throw Error(ar.errors.file);
      const form = new FormData();
      form.set("requestId", requestId);
      form.set("receiptKey", key);
      form.set("file", item.file);
      const response = await fetch("/api/attachments", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || ar.common.failed);
      setFiles((prev) =>
        prev.map((f) =>
          f.key === item.key ? { ...f, id: data.id, uploading: false } : f,
        ),
      );
    } catch (e) {
      setFiles((prev) =>
        prev.map((f) =>
          f.key === item.key
            ? {
                ...f,
                uploading: false,
                error: e instanceof Error ? e.message : ar.common.failed,
              }
            : f,
        ),
      );
    }
  }
  async function choose(selected: FileList | null) {
    if (!selected?.length || uploadLock.current) return;
    if (files.length + selected.length > 20) {
      setError("يمكن إرفاق 20 ملفًا كحد أقصى لكل محضر");
      return;
    }
    setError("");
    uploadLock.current = true;
    const added = Array.from(selected).map((file) => ({
      key: crypto.randomUUID(),
      file,
      uploading: true,
    }));
    setFiles((prev) => [...prev, ...added]);
    try {
      for (const item of added) await upload(item);
    } finally {
      uploadLock.current = false;
    }
  }
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!complete) {
      setError(ar.errors.receiptAttachments);
      return;
    }
    setBusy(true);
    try {
      const input = receiptSchema.parse({
        requestId,
        key,
        notes,
        attachmentIds: files.map((f) => f.id),
        lines: lines.map((l) => ({ lineId: l.id, ...quantities[l.id] })),
      });
      for (const l of lines) {
        const err = receiptQuantityError(
          l.quantity,
          l.accepted,
          l.returned,
          quantities[l.id],
        );
        if (err) throw Error(l.material_name + ": " + ar.errors[err]);
      }
      await command("receipt", input);
      onDone();
    } catch (e) {
      setError(
        e instanceof Error && !("issues" in e) ? e.message : ar.errors.invalid,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack" noValidate onSubmit={submit}>
      <Message error={error} />
      <p className="muted">
        تم تعبئة المتبقي في المقبول. عدّل المقبول للاستلام الجزئي؛ التالف
        والمرفوض يُخصمان منه تلقائيًا. المرتجع يُخصم من استلام سابق.
      </p>
      <fieldset disabled={busy} className="form-fieldset stack">
        {lines.map((l) => {
          const value = quantities[l.id];
          return (
            <section className="receipt-item" key={l.id}>
              <div className="receipt-item-heading">
                <strong>{l.material_name}</strong>
                <span className="muted">
                  المطلوب {number(l.quantity, digits)} · المتبقي{" "}
                  {number(
                    remainingQuantity(l.quantity, l.accepted, l.returned),
                    digits,
                  )}{" "}
                  {l.unit_name}
                </span>
              </div>
              <div className="receipt-quantities">
                {(["accepted", "damaged", "rejected", "returned"] as const).map(
                  (field) => (
                    <NumberField
                      key={field}
                      label={ar.fields[field]}
                      ariaLabel={l.material_name + " · " + ar.fields[field]}
                      value={value[field]}
                      emptyOnBlur="0"
                      onChange={(quantity) =>
                        setQuantities((prev) => ({
                          ...prev,
                          [l.id]: changeReceiptQuantity(
                            prev[l.id],
                            field,
                            quantity,
                          ),
                        }))
                      }
                    />
                  ),
                )}
              </div>
            </section>
          );
        })}
        <section className="receipt-attachments stack">
          <strong>
            مرفقات الاستلام <span className="muted">(مطلوبة)</span>
          </strong>
          <p className="muted">
            صوّر مستند الاستلام أو اختر صورًا وملفات. حد الملف 4 ميجابايت.
          </p>
          <input
            type="file"
            ref={camera}
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              void choose(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            type="file"
            ref={gallery}
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            hidden
            onChange={(e) => {
              void choose(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="row">
            <Button
              type="button"
              disabled={uploading}
              onClick={() => camera.current?.click()}
            >
              <Camera size={17} />
              الكاميرا
            </Button>
            <Button
              type="button"
              disabled={uploading}
              onClick={() => gallery.current?.click()}
            >
              <Images size={17} />
              الاستوديو / الملفات
            </Button>
          </div>
          <div className="stack" aria-live="polite">
            {files.map((f) => (
              <div className="receipt-file" key={f.key}>
                <span className="break">
                  {f.file.name}
                  <small className={f.error ? "error-message" : "muted"}>
                    {f.uploading ? "جارٍ الرفع…" : f.error || "تم الرفع"}
                  </small>
                </span>
                {f.id ? <Check size={18} /> : null}
                {f.error ? (
                  <Button
                    type="button"
                    className="icon small"
                    disabled={uploading}
                    aria-label={"إعادة رفع " + f.file.name}
                    onClick={() => void upload(f)}
                  >
                    <RotateCw size={16} />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className="icon small"
                  disabled={uploading}
                  aria-label={"حذف " + f.file.name}
                  onClick={() =>
                    setFiles((prev) => prev.filter((x) => x.key !== f.key))
                  }
                >
                  <X size={16} />
                </Button>
              </div>
            ))}
          </div>
        </section>
        <Field label={ar.fields.notes}>
          <textarea
            className="input"
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </fieldset>
      <div className="form-footer">
        <Button type="button" onClick={onDone} disabled={busy || uploading}>
          إلغاء
        </Button>
        <Button
          type="submit"
          intent="green"
          pending={busy}
          disabled={!complete || uploading}
        >
          تأكيد الاستلام
        </Button>
      </div>
    </form>
  );
}
