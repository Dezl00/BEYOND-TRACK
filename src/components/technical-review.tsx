"use client";
import { useLanguage } from "@/components/language-context";

import { useState, useEffect } from "react";
import { Check, X } from "lucide-react";
import { technicalReviewSchema } from "@/lib/validation";

import { number } from "@/lib/format";
import { useDigits } from "./format-context";
import type { RequestLine } from "./quotation-editor";
import { Button, Message, command } from "./ui";
export default function TechnicalReview({
  request,
  lines,
  onDone,
  onBusyChange,
}: {
  request: { id: string; version: number };
  lines: RequestLine[];
  onDone: () => void;
  onBusyChange: (value: boolean) => void;
}) {
  const { m: msg, number, unit } = useLanguage();
  
  const digits = useDigits();
  const [review, setReview] = useState(() =>
    lines.map((line) => ({
      id: line.id,
      approved: null as boolean | null,
      note: "",
    })),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  const complete = review.every(
    (row) => row.approved !== null && (row.approved || row.note.trim()),
  );
  function update(id: string, patch: Partial<(typeof review)[number]>) {
    setReview((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  }
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!complete || busy) return;
    setBusy(true);
    setError("");
    try {
      await command(
        "technical-review",
        technicalReviewSchema.parse({
          id: request.id,
          version: request.version,
          lines: review.map((row) => ({
            ...row,
            note: row.approved ? "" : row.note,
          })),
        }),
      );
      onDone();
    } catch (error) {
      setError(
        error instanceof Error && !("issues" in error)
          ? error.message
          : msg.errors.invalid,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="stack" onSubmit={submit} noValidate>
      <Message error={error} />
      <div className="row end">
        <Button
          type="button"
          disabled={busy}
          onClick={() =>
            setReview((prev) =>
              prev.map((row) => ({ ...row, approved: true, note: "" })),
            )
          }
        >
          <Check size={17} />{msg.interface.approveAll} </Button>
      </div>
      <div className="table-wrap">
        <table className="technical-review-table">
          <thead>
            <tr>
              <th>{msg.fields.material}</th>
              <th>{msg.fields.quantity}</th>
              <th>{msg.fields.action}</th>
              <th>{msg.interface.rejectionNote}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={line.id}>
                <td className="wrap">{line.material_name}</td>
                <td>
                  {number(line.quantity, digits)} {unit(line.unit_name)}
                </td>
                <td>
                  <div className="row gap-sm">
                    <Button
                      type="button"
                      className="small"
                      intent={review[i].approved === true ? "green" : undefined}
                      aria-label={msg.common.approve + " " + line.material_name}
                      aria-pressed={review[i].approved === true}
                      disabled={busy}
                      onClick={() =>
                        update(line.id, { approved: true, note: "" })
                      }
                    >
                      <Check size={16} />{msg.common.approve} </Button>
                    <Button
                      type="button"
                      className="small"
                      intent={review[i].approved === false ? "red" : undefined}
                      aria-label={msg.common.reject + " " + line.material_name}
                      aria-pressed={review[i].approved === false}
                      disabled={busy}
                      onClick={() => update(line.id, { approved: false })}
                    >
                      <X size={16} />{msg.common.reject} </Button>
                  </div>
                </td>
                <td>
                  {review[i].approved === false ? (
                    <textarea
                      className="input"
                      aria-label={msg.interface.rejectNotePrefix + " " + line.material_name}
                      value={review[i].note}
                      required
                      maxLength={1000}
                      disabled={busy}
                      onChange={(e) =>
                        update(line.id, { note: e.target.value })
                      }
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-footer">
        <Button type="button" disabled={busy} onClick={onDone}>{msg.common.cancel} </Button>
        <Button type="submit" intent="blue" pending={busy} disabled={!complete}>{msg.interface.saveReview} </Button>
      </div>
    </form>
  );
}
