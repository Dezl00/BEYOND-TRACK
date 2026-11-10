"use client";
import { NumberField } from "./number-field";
import { decimalText } from "@/lib/format";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Send } from "lucide-react";
import { ar } from "@/messages/ar";
import { requestSchema } from "@/lib/validation";
import { Button, Field, Lookup, Message, command } from "./ui";
type Line = {
  materialId: string;
  quantity: string;
  notes: string;
  label?: string;
  reviewNote?: string;
  key: string;
};
export default function RequestForm({
  project = "",
  initial,
}: {
  project?: string;
  initial?: {
    id: string;
    version: number;
    project_id: string;
    project_name?: unknown;
    notes: string;
    status: number;
    lines: Record<string, unknown>[];
  };
}) {
  const router = useRouter(),
    [projectId, setProject] = useState(initial?.project_id || project),
    [notes, setNotes] = useState(initial?.notes || ""),
    [lines, setLines] = useState<Line[]>(
      initial?.lines.map((l, i) => ({
        key: String(i),
        materialId: String(l.material_id),
        quantity: decimalText(l.quantity),
        notes: String(l.notes),
        reviewNote: String(l.review_note || ""),
        label: String(l.material_name),
      })) || [{ key: "first", materialId: "", quantity: "", notes: "" }],
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function update(key: string, field: string, value: string) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)),
    );
  }
  async function save(submit: boolean) {
    if (submit && !notes.trim()) {
      setError(ar.errors.usageScope);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const data = requestSchema.parse({
        id: initial?.id,
        version: initial?.version,
        projectId,
        notes,
        submit,
        lines: lines.map(({ key, label, reviewNote, ...rest }) => rest),
      });
      const result = await command("request", data);
      router.push(`/requests/${result.id}`);
      router.refresh();
    } catch (e) {
      setError(
        "issues" in (e as object) ? ar.errors.invalid : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void save(true);
      }}
      noValidate
    >
      <Message error={error} />
      <section className="panel panel-body">
        <div className="fields">
          <Field label={ar.common.project}>
            <Lookup
              resource="projects"
              value={projectId}
              initialLabel={String(initial?.project_name || "")}
              onChange={(value) => {
                if (initial) return;
                setProject(value);
                setLines([
                  {
                    key: crypto.randomUUID(),
                    materialId: "",
                    quantity: "",
                    notes: "",
                  },
                ]);
              }}
            />
          </Field>
          <Field label="نطاق الاستخدام">
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              required
            />
          </Field>
        </div>
      </section>
      <section className="panel">
        <div className="panel-heading">
          <h2>{ar.requests.lines}</h2>
          <Button
            type="button"
            className="small"
            onClick={() =>
              setLines((prev) => [
                ...prev,
                {
                  key: crypto.randomUUID(),
                  materialId: "",
                  quantity: "",
                  notes: "",
                },
              ])
            }
            disabled={lines.length >= 100}
          >
            <Plus size={16} />
            {ar.requests.addLine}
          </Button>
        </div>
        <div className="panel-body stack">
          {lines.map((line) => (
            <div className="line-editor" key={line.key}>
              <Field label={ar.fields.material}>
                <Lookup
                  resource="materials"
                  project={projectId || undefined}
                  value={line.materialId}
                  initialLabel={line.label}
                  onChange={(value, label) => {
                    update(line.key, "materialId", value);
                    update(line.key, "label", label || "");
                  }}
                />
              </Field>
              <NumberField
                label={ar.fields.quantity}
                value={line.quantity}
                onChange={(value) => update(line.key, "quantity", value)}
              />
              <div className="line-note">
                {line.reviewNote ? (
                  <p className="review-note text-red">{line.reviewNote}</p>
                ) : null}
                <Field label={ar.fields.notes}>
                  <input
                    className="input"
                    value={line.notes}
                    maxLength={1000}
                    onChange={(e) => update(line.key, "notes", e.target.value)}
                  />
                </Field>
              </div>
              <Button
                type="button"
                className="icon line-remove"
                intent="red"
                aria-label={ar.requests.removeLine}
                onClick={() =>
                  setLines((prev) => prev.filter((l) => l.key !== line.key))
                }
                disabled={lines.length === 1}
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
      </section>
      <div className="row end">
        {!initial || initial.status === 0 ? (
          <Button type="button" pending={busy} onClick={() => void save(false)}>
            {ar.common.draft}
          </Button>
        ) : null}
        <Button intent="blue" type="submit" pending={busy}>
          <Send size={16} />
          {initial && ![0, 14].includes(initial.status)
            ? ar.common.save
            : ar.common.submit}
        </Button>
      </div>
    </form>
  );
}
