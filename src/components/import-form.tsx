"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "./language-context";
import {
  catalogHeaders,
  transferText,
  type ImportPreviewRow,
} from "@/lib/catalog-transfer";
import { Button, Field, Lookup, Message, FilePicker, Modal } from "./ui";
export default function ImportForm({ project }: { project?: string }) {
  const { locale, m: msg } = useLanguage(),
    t = transferText[locale],
    router = useRouter();
  const [projectId, setProject] = useState(project || ""),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [preview, setPreview] = useState<{
    items: ImportPreviewRow[];
    valid: boolean;
  } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setPreview(null);
    setError("");
    setSuccess("");
    if (!file || !projectId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        if (file.size > 4 * 1024 * 1024 || !/\.(xlsx|csv)$/i.test(file.name))
          throw Error(msg.errors.file);
        const form = new FormData();
        form.set("projectId", projectId);
        form.set("file", file);
        form.set("preview", "true");
        const r = await fetch("/api/import", {
            method: "POST",
            body: form,
            signal: controller.signal,
          }),
          data = await r.json();
        if (!r.ok) throw Error(data.error);
        if (!controller.signal.aborted) {
          setPreview(data);
          setPreviewOpen(true);
        }
      } catch (e) {
        if (!controller.signal.aborted) setError((e as Error).message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [file, projectId, revision, msg.errors.file]);
  return (
    <form
      id="boq-import-form"
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file || !preview?.valid || loading || busy) return;
        setBusy(true);
        setError("");
        setSuccess("");
        try {
          const form = new FormData();
          form.set("projectId", projectId);
          form.set("file", file);
          const r = await fetch("/api/import", { method: "POST", body: form }),
            data = await r.json();
          if (!r.ok) {
            setRevision((n) => n + 1);
            throw Error(data.error);
          }
          setSuccess(
            msg.interface.importResult
              .replace("{rows}", String(data.rows))
              .replace("{materials}", String(data.materials))
              .replace("{units}", String(data.units)),
          );
          setPreview(null);
          router.refresh();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Message error={error} success={success} />
      <p className="muted">{t.ready}</p>
      <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="fields">
          <Field label={msg.common.project}>
            <Lookup
              resource="projects"
              value={projectId}
              onChange={(v) => {
                setPreview(null);
                setProject(v);
              }}
            />
          </Field>
          <Field label={msg.fields.file}>
            <FilePicker
              accept=".xlsx,.csv"
              onChange={(v) => {
                setPreview(null);
                setFile(v);
              }}
            />
          </Field>
        </div>
      </fieldset>
      {loading ? <p role="status">{t.preview}…</p> : null}
      {preview ? (
        <>
          <Button type="button" onClick={() => setPreviewOpen(true)}>
            {t.preview}
          </Button>
          <Modal
            title={t.preview}
            wide
            open={previewOpen}
            onOpenChange={setPreviewOpen}
          >
            <section aria-label={t.preview} className="stack">
              <div className="row">
                {(["new", "existing", "duplicate", "error"] as const).map(
                  (status) => (
                    <span key={status}>
                      {t[status]}:{" "}
                      {preview.items.filter((r) => r.status === status).length}
                    </span>
                  ),
                )}
              </div>
              {!preview.valid ? <p role="alert">{t.blocked}</p> : null}
              <div
                className="table-wrap"
                style={{ maxHeight: "60vh", overflow: "auto" }}
              >
                <table>
                  <thead>
                    <tr>
                      <th>{t.row}</th>
                      {catalogHeaders(locale).map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                      <th>{t.result}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((r) => (
                      <tr
                        key={r.row}
                        style={
                          r.status === "error"
                            ? {
                                background: "var(--danger-soft, #fee2e2)",
                                color: "#991b1b",
                              }
                            : undefined
                        }
                      >
                        <td>{r.row}</td>
                        {r.values.map((v, i) => (
                          <td key={i}>{v}</td>
                        ))}
                        <td>
                          {t[r.status]}
                          {r.issue ? " — " + t[r.issue] : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="row end">
              <Button
                type="submit"
                form="boq-import-form"
                intent="blue"
                pending={busy}
                disabled={!preview.valid || loading || busy}
              >
                {t.confirm}
              </Button>
            </div>
          </Modal>
        </>
      ) : null}
      <div className="row end">
        <a href="/api/import" className="btn">
          {msg.common.template}
        </a>
      </div>
    </form>
  );
}
