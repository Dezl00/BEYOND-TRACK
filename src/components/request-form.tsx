"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Send } from "lucide-react";
import type { z } from "zod";
import { decimalText } from "@/lib/format";
import { requestSchema } from "@/lib/validation";
import { useLanguage } from "./language-context";
import { RequestPreview } from "./request-preview";
import { NumberField } from "./number-field";
import { Button, Field, DateInput, Lookup, Message, Modal, command } from "./ui";

type Line = {
  key: string;
  materialId: string;
  manualName?: string;
  search?: string;
  label?: string;
  item?: string;
  unitId?: string;
  unitName?: string;
  quantity: string;
  notes: string;
  reviewNote?: string;
};
type RequestData = z.infer<typeof requestSchema>;
const blankLine = (): Line => ({
  key: crypto.randomUUID(),
  materialId: "",
  quantity: "",
  notes: "",
});
const hasContent = (line: Line) =>
  Boolean(
    line.materialId ||
    line.manualName ||
    line.search?.trim() ||
    line.quantity ||
    line.notes.trim(),
  );
function withTrailingRow(rows: Line[]) {
  let end = rows.length;
  while (end && !hasContent(rows[end - 1])) end--;
  if (end === 100) return rows;
  return [...rows.slice(0, end), rows[end] ?? blankLine()];
}

export default function RequestForm({
  project = "",
  projectName = "",
  initial,
}: {
  project?: string;
  projectName?: string;
  initial?: {
    id: string;
    version: number;
    project_id: string;
    project_name?: unknown;
    required_by?: string | null;
    notes: string;
    status: number;
    lines: Record<string, unknown>[];
  };
}) {
  const { m: msg, unit } = useLanguage();
  const router = useRouter();
  const [projectId, setProject] = useState(initial?.project_id || project);
  const [projectLabel, setProjectLabel] = useState(
    String(initial?.project_name || projectName),
  );
  const [requiredBy, setRequiredBy] = useState(initial?.required_by || "");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [lines, setLines] = useState(() =>
    withTrailingRow(
      initial?.lines.map((l) => ({
        key: String(l.material_id),
        materialId: String(l.material_id),
        quantity: decimalText(l.quantity),
        notes: String(l.notes || ""),
        reviewNote: String(l.review_note || ""),
        label: String(l.material_name),
        item: String(l.boq_name || ""),
        unitName: unit(l.unit_name),
      })) ?? [],
    ),
  );
  const [preview, setPreview] = useState<RequestData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const isSubmission = !initial || [0, 14].includes(initial.status);
  const filled = lines.filter(hasContent);
  function update(key: string, values: Partial<Line>) {
    setLines((previous) =>
      withTrailingRow(
        previous.map((line) =>
          line.key === key ? { ...line, ...values } : line,
        ),
      ),
    );
  }
  async function save(data: RequestData) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await command("request", data);
      router.push(`/requests/${result.id}`);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      sending.current = false;
      setBusy(false);
    }
  }
  function prepare(submit: boolean) {
    setError("");
    if (submit && !notes.trim()) return setError(msg.errors.usageScope);
    if (!filled.length) return setError(msg.requests.emptyLines);
    if (filled.some((line) => line.manualName && !line.unitId))
      return setError(msg.requests.chooseUnit);
    const result = requestSchema.safeParse({
      id: initial?.id,
      version: initial?.version,
      projectId,
      requiredBy,
      notes,
      submit,
      lines: filled.map((line) => ({
        ...(line.manualName
          ? { manualName: line.manualName, unitId: line.unitId }
          : { materialId: line.materialId }),
        quantity: line.quantity,
        notes: line.notes,
      })),
    });
    if (!result.success)
      return setError(result.error.issues[0]?.message || msg.errors.invalid);
    if (submit && isSubmission) setPreview(result.data);
    else void save(result.data);
  }
  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault();
        prepare(true);
      }}
      noValidate
    >
      {!preview && <Message error={error} />}
      <section className="panel panel-body">
        <div className="fields">
          <Field label={msg.common.project}>
            <Lookup
              resource="projects"
              value={projectId}
              initialLabel={projectLabel}
              disabled={Boolean(initial)}
              onChange={(value, label) => {
                if (value !== projectId) setLines([blankLine()]);
                setProject(value);
                setProjectLabel(label || "");
              }}
            />
          </Field>
          <Field label={msg.fields.requiredBy}>
            <DateInput value={requiredBy} onChange={setRequiredBy} />
          </Field>
          <Field label={msg.interface.usage}>
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
          <h2>{msg.requests.lines}</h2>
        </div>
        <div className="panel-body stack">
          {lines.map((line) => (
            <div className="line-editor" key={line.key}>
              <div className="stack">
                <Field label={msg.fields.material}>
                  <Lookup
                    resource="materials"
                    project={projectId}
                    disabled={!projectId}
                    value={
                      line.manualName
                        ? `manual:${line.manualName}`
                        : line.materialId
                    }
                    initialLabel={line.label}
                    clearable
                    onSearchChange={(search) => update(line.key, { search })}
                    onCreate={(manualName) =>
                      update(line.key, {
                        materialId: "",
                        manualName,
                        label: manualName,
                        item: msg.requests.manualEntry,
                        unitId: "",
                        unitName: "",
                      })
                    }
                    onChange={(materialId, label, item) =>
                      update(line.key, {
                        materialId,
                        label,
                        manualName: "",
                        item: item?.boq_name,
                        unitId: "",
                        unitName: unit(item?.unit_name),
                      })
                    }
                  />
                </Field>
                {line.manualName && (
                  <Field label={msg.fields.unit}>
                    <Lookup
                      resource="units"
                      value={line.unitId || ""}
                      initialLabel={line.unitName}
                      onChange={(unitId, unitName) =>
                        update(line.key, { unitId, unitName })
                      }
                    />
                  </Field>
                )}
              </div>
              <NumberField
                label={msg.fields.quantity}
                value={line.quantity}
                onChange={(quantity) => update(line.key, { quantity })}
              />
              <div className="line-note">
                {line.reviewNote && (
                  <p className="review-note text-red">{line.reviewNote}</p>
                )}
                <Field label={msg.fields.notes}>
                  <input
                    className="input"
                    value={line.notes}
                    maxLength={1000}
                    onChange={(e) =>
                      update(line.key, { notes: e.target.value })
                    }
                  />
                </Field>
              </div>
              <Button
                type="button"
                className="icon line-remove"
                intent="red"
                aria-label={msg.requests.removeLine}
                disabled={!hasContent(line)}
                onClick={() =>
                  setLines((previous) =>
                    withTrailingRow(previous.filter((l) => l.key !== line.key)),
                  )
                }
              >
                <Trash2 size={16} />
              </Button>
            </div>
          ))}
        </div>
      </section>
      <div className="row end">
        {(!initial || initial.status === 0) && (
          <Button type="button" pending={busy} onClick={() => prepare(false)}>
            {msg.common.draft}
          </Button>
        )}
        <Button intent="blue" type="submit" pending={busy}>
          <Send size={16} />
          {isSubmission ? msg.common.submit : msg.common.save}
        </Button>
      </div>
      <Modal
        title={msg.requests.preview}
        wide
        className="request-preview"
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPreview(null);
            setError("");
          }
        }}
      >
        {preview && (
          <>
            <Message error={error} />
            <RequestPreview
              project={projectLabel}
              requiredBy={preview.requiredBy}
              notes={preview.notes}
              lines={filled}
            />
            <div className="form-footer">
              <Button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPreview(null);
                  setError("");
                }}
              >
                {msg.common.edit}
              </Button>
              <Button
                intent="blue"
                type="button"
                pending={busy}
                onClick={() => void save(preview)}
              >
                <Send size={16} />
                {msg.requests.confirmSubmit}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </form>
  );
}
