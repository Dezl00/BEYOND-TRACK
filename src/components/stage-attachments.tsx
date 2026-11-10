"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, X, RotateCw, FileText } from "lucide-react";
import { ar } from "@/messages/ar";
import type { AttachmentPurpose } from "@/lib/attachments";
import { Button, Field } from "./ui";

export type UploadState = { ids: string[]; ready: boolean; uploading: boolean };
type Item = {
  key: string;
  name: string;
  id?: string;
  file?: File;
  uploading: boolean;
  error?: string;
};
export default function StageAttachments({
  requestId,
  uploadKey,
  purpose,
  label,
  initial = [],
  disabled = false,
  onChange,
}: {
  requestId: string;
  uploadKey: string;
  purpose: AttachmentPurpose;
  label: string;
  initial?: { id: string; name: string }[];
  disabled?: boolean;
  onChange: (state: UploadState) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>(() =>
    initial.map((f) => ({ ...f, key: f.id, uploading: false })),
  );
  const uploading = items.some((f) => f.uploading);
  useEffect(() => {
    onChange({
      ids: items.flatMap((f) => (f.id ? [f.id] : [])),
      ready: items.every((f) => !!f.id && !f.error && !f.uploading),
      uploading,
    });
  }, [items, uploading, onChange]);
  async function upload(item: Item) {
    setItems((prev) =>
      prev.map((f) =>
        f.key === item.key ? { ...f, uploading: true, error: undefined } : f,
      ),
    );
    try {
      const file = item.file!;
      if (
        !file.size ||
        file.size > 4 * 1024 * 1024 ||
        (file.type &&
          file.type !== "application/octet-stream" &&
          ![
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
          ].includes(file.type))
      )
        throw Error(ar.errors.file);
      const body = new FormData();
      body.set("requestId", requestId);
      body.set("uploadKey", uploadKey);
      body.set("purpose", purpose);
      body.set("file", file);
      const response = await fetch("/api/attachments", {
        method: "POST",
        body,
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      setItems((prev) =>
        prev.map((f) =>
          f.key === item.key ? { ...f, id: result.id, uploading: false } : f,
        ),
      );
    } catch (error) {
      setItems((prev) =>
        prev.map((f) =>
          f.key === item.key
            ? { ...f, uploading: false, error: (error as Error).message }
            : f,
        ),
      );
    }
  }
  async function choose(files: FileList | null) {
    if (!files) return;
    const added = Array.from(files)
      .slice(0, 20 - items.length)
      .map((file) => ({
        key: crypto.randomUUID(),
        file,
        name: file.name,
        uploading: true,
      }));
    setItems((prev) => [...prev, ...added]);
    for (const item of added) await upload(item);
    if (input.current) input.current.value = "";
  }
  return (
    <Field label={label}>
      <div className="stack">
        <input
          ref={input}
          aria-label={label}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          hidden
          onChange={(e) => void choose(e.target.files)}
        />
        <Button
          type="button"
          disabled={disabled || uploading || items.length >= 20}
          onClick={() => input.current?.click()}
        >
          <Upload size={17} />
          رفع المرفقات
        </Button>
        {items.map((item) => (
          <div className="attachment" key={item.key}>
            <FileText size={18} />
            <span className="attachment-name">
              {item.name}
              {item.uploading ? (
                <small className="cell-sub">جارٍ الرفع</small>
              ) : null}
              {item.error ? (
                <small className="error-message" role="alert">
                  {item.error}
                </small>
              ) : null}
            </span>
            {item.error ? (
              <Button
                type="button"
                className="icon small"
                aria-label={"إعادة رفع " + item.name}
                disabled={disabled || uploading}
                onClick={() => void upload(item)}
              >
                <RotateCw size={16} />
              </Button>
            ) : null}
            <Button
              type="button"
              className="icon small"
              aria-label={"إزالة " + item.name}
              disabled={disabled || uploading}
              onClick={() =>
                setItems((prev) => prev.filter((f) => f.key !== item.key))
              }
            >
              <X size={16} />
            </Button>
          </div>
        ))}
      </div>
    </Field>
  );
}
