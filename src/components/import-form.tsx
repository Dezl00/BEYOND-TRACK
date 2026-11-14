"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Pencil, Save, Trash2, UploadCloud } from "lucide-react";
import { useLanguage } from "./language-context";
import {
  catalogHeaders,
  transferText,
  type ImportPreviewRow,
} from "@/lib/catalog-transfer";
import { Button, Field, Lookup, Message, FilePicker, Modal } from "./ui";
type Preview = { items: ImportPreviewRow[]; valid: boolean };
export default function ImportForm({ project }: { project?: string }) {
  const { locale, m: msg } = useLanguage(),
    t = transferText[locale],
    router = useRouter();
  const [projectId, setProject] = useState(project || ""),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<Preview | null>(null),
    [projectOpen, setProjectOpen] = useState(false),
    [previewOpen, setPreviewOpen] = useState(false),
    [dragging, setDragging] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [activeTab, setActiveTab] = useState<"new" | "duplicate" | "error">("new"),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [editing, setEditing] = useState<number | null>(null),
    [draft, setDraft] = useState<string[]>([]);
  useEffect(() => {
    if (project) setProject(project);
  }, [project]);
  async function makePreview(rows?: string[][]) {
    if (!projectId) return;
    const form = new FormData();
    form.set("projectId", projectId);
    if (rows) form.set("rows", JSON.stringify(rows));
    else if (file) form.set("file", file);
    else return;
    form.set("preview", "true");
    setPreviewOpen(true);
    setPreview(null);
    setLoading(true);
    try {
      const r = await fetch("/api/import", { method: "POST", body: form }),
        data = await r.json();
      if (!r.ok) throw Error(data.error);
      setPreview(data);
    } finally {
      setLoading(false);
    }
  }
  async function previewFile(next: File) {
    if (next.size > 4 * 1024 * 1024 || !/\.(xlsx|csv)$/i.test(next.name)) {
      setError(msg.errors.file);
      return;
    }
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("file", next);
    form.set("preview", "true");
    setPreviewOpen(true);
    setLoading(true);
    try {
      const r = await fetch("/api/import", { method: "POST", body: form }),
        data = await r.json();
      if (!r.ok) throw Error(data.error);
      setPreview(data);
      setPreviewOpen(true);
    } catch (e) {
      setError((e as Error).message);
      setPreviewOpen(false);
    } finally {
      setLoading(false);
    }
  }
  function chooseFile(next: File | null) {
    if (!next) return;
    setError("");
    setSuccess("");
    setPreview(null);
    setFile(next);
    if (!projectId) setProjectOpen(true);
    else void previewFile(next);
  }
  async function editRow(index: number) {
    const items = preview?.items || [],
      values = items.map((x) => x.values);
    if (editing === index) {
      values[index] = draft;
      try {
        setBusy(true);
        await makePreview(values);
        setEditing(null);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    } else {
      setEditing(index);
      setDraft([...items[index].values]);
    }
  }
  async function deleteRow(index: number) {
    if (!preview) return;
    const rows = preview.items
      .filter((_, i) => i !== index)
      .map((r) => r.values);
    try {
      setBusy(true);
      await makePreview(rows);
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!preview?.valid || !preview.items.length || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("rows", JSON.stringify(preview.items.map((r) => r.values)));
      const r = await fetch("/api/import", { method: "POST", body: form }),
        data = await r.json();
      if (!r.ok) throw Error(data.error);
      setSuccess(
        msg.interface.importResult
          .replace("{rows}", String(data.rows))
          .replace("{materials}", String(data.materials))
          .replace("{units}", String(data.units)),
      );
      setPreview(null);
      setPreviewOpen(false);
      setFile(null);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack boq-import-modern">
      <Message error={error} success={success} />
      <div
        className="import-dropzone"
        data-dragging={dragging || undefined}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null))
            setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          chooseFile(e.dataTransfer.files[0] || null);
        }}
      >
        <span className="import-drop-icon">
          <UploadCloud size={27} />
        </span>
        <strong>{dragging ? t.dropHere : t.dropPrompt}</strong>
        <span className="muted">{t.dropHelp}</span>
        <Field label={t.chooseFile}>
          <FilePicker accept=".xlsx,.csv" onChange={chooseFile} />
        </Field>
      </div>
      <Modal
        title={t.selectProject}
        open={projectOpen}
        onOpenChange={setProjectOpen}
      >
        <div className="stack">
          <Field label={msg.common.project}>
            <Lookup
              resource="projects"
              value={projectId}
              onChange={setProject}
            />
          </Field>
          <div className="row end">
            <Button
              intent="blue"
              type="button"
              disabled={!projectId}
              onClick={async () => {
                setProjectOpen(false);
                try {
                  await makePreview();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {t.continue}
            </Button>
          </div>
        </div>
      </Modal>
      <Modal
        title={t.preview}
        wide
        className="boq-preview-dialog"
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      >
        {preview ? (
          <div className="stack import-preview-content">
            <div className="import-preview-summary">
              {(["new", "duplicate", "error"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="import-preview-tab"
                  data-state={s}
                  aria-selected={activeTab === s}
                  onClick={() => setActiveTab(s)}
                >
                  <span>{t[s]}</span>
                  <b>{preview.items.filter((x) => x.status === s).length}</b>
                </button>
              ))}
            </div>
            {!preview.valid ? (
              <p role="alert" className="import-warning">
                {t.blocked}
              </p>
            ) : null}
            <div className="boq-preview-table">
              <table>
                <colgroup>
                  <col style={{ width: "44px" }} />
                  {catalogHeaders(locale).map((_, i) => (
                    <col key={i} />
                  ))}
                  <col style={{ width: "88px" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>#</th>
                    {catalogHeaders(locale).map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                    <th>{t.actions}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items
                    .filter((r) => r.status === activeTab)
                    .map((r) => {
                      const index = preview.items.indexOf(r);
                      return (
                        <tr
                          key={r.row}
                          data-error={r.status === "error" || undefined}
                          data-status={r.status}
                          title={r.issue ? t[r.issue] : t[r.status]}
                        >
                          <td>{index + 1}</td>
                          {r.values.map((value, i) => (
                            <td key={i}>
                              {editing === index ? (
                                <input
                                  className="preview-cell-input"
                                  aria-label={catalogHeaders(locale)[i]}
                                  value={draft[i] || ""}
                                  onChange={(e) =>
                                    setDraft((d) =>
                                      d.map((v, j) =>
                                        j === i ? e.target.value : v,
                                      ),
                                    )
                                  }
                                />
                              ) : (
                                value || "—"
                              )}
                            </td>
                          ))}
                          <td>
                            <div className="preview-row-actions">
                              {r.status === "error" ? (
                                <span
                                  className="preview-row-error"
                                  aria-label={r.issue ? t[r.issue] : t.error}
                                >
                                  <CircleAlert size={16} />
                                </span>
                              ) : null}
                              <button
                                type="button"
                                className="icon"
                                title={editing === index ? t.save : t.edit}
                                aria-label={editing === index ? t.save : t.edit}
                                disabled={busy}
                                onClick={() => void editRow(index)}
                              >
                                {editing === index ? (
                                  <Save size={17} />
                                ) : (
                                  <Pencil size={17} />
                                )}
                              </button>
                              <button
                                type="button"
                                className="icon danger"
                                title={t.delete}
                                aria-label={t.delete}
                                disabled={busy}
                                onClick={() => void deleteRow(index)}
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="row end">
              <Button type="button" onClick={() => setPreviewOpen(false)}>
                {msg.common.close}
              </Button>
              <Button
                intent="blue"
                type="button"
                pending={busy}
                disabled={
                  !preview.valid || !preview.items.length || editing !== null
                }
                onClick={() => void submit()}
              >
                {t.confirm}
              </Button>
            </div>
          </div>
        ) : loading ? (
          <div
            className="import-skeleton"
            aria-busy="true"
            aria-label={t.preview}
          >
            {Array.from({ length: 5 }, (_, i) => (
              <div className="import-skeleton-card" key={i}>
                <div className="skeleton-line short" />
                <div className="skeleton-grid">
                  {Array.from({ length: 7 }, (_, j) => (
                    <i key={j} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
