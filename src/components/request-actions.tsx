"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ar } from "@/messages/ar";
import { type Actor, can, transitions } from "@/lib/domain";
import { orderSchema, receiptSchema, transitionSchema } from "@/lib/validation";
import {
  Button,
  Modal,
  Field,
  Lookup,
  DateInput,
  Message,
  command,
  SelectBox,
  FilePicker,
} from "./ui";
type Line = {
  id: string;
  material_name: unknown;
  quantity: unknown;
  price: unknown;
};
export function RequestActions({
  actor,
  request,
  lines,
}: {
  actor: Actor;
  request: {
    id: string;
    status: number;
    version: number;
    supplier_id: string | null;
    expected_at: string | null;
  };
  lines: Line[];
}) {
  const router = useRouter(),
    [mode, setMode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState(""),
    [supplier, setSupplier] = useState(request.supplier_id || ""),
    [expected, setExpected] = useState(request.expected_at || ""),
    [prices, setPrices] = useState<Record<string, string>>(
      Object.fromEntries(lines.map((l) => [l.id, String(l.price || "")])),
    ),
    [receipt, setReceipt] = useState<Record<string, Record<string, string>>>(
      Object.fromEntries(
        lines.map((l) => [
          l.id,
          { accepted: "0", damaged: "0", rejected: "0", returned: "0" },
        ]),
      ),
    ),
    [key, setKey] = useState(""),
    [target, setTarget] = useState("2");
  function open(value: string) {
    setMode(value);
    setError("");
    setReason("");
    if (value === "receipt") setKey(crypto.randomUUID());
  }
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "order")
        await command(
          "order",
          orderSchema.parse({
            id: request.id,
            version: request.version,
            supplierId: supplier,
            expectedAt: expected,
            prices: lines.map((l) => ({ id: l.id, price: prices[l.id] })),
          }),
        );
      else if (mode === "receipt")
        await command(
          "receipt",
          receiptSchema.parse({
            requestId: request.id,
            key,
            notes: reason,
            lines: lines.map((l) => ({ lineId: l.id, ...receipt[l.id] })),
          }),
        );
      else if (mode === "overage") await command("overage", { id: request.id });
      else
        await command(
          "transition",
          transitionSchema.parse({
            id: request.id,
            version: request.version,
            status: Number(mode === "override" ? target : mode),
            reason,
          }),
        );
      setMode("");
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
    <>
      <div className="row">
        {request.status === 0 && can(actor, "requests.create") ? (
          <Button intent="blue" onClick={() => open("1")}>
            {ar.common.submit}
          </Button>
        ) : null}
        {request.status === 1 && can(actor, "technical.approve") ? (
          <Button intent="blue" onClick={() => open("9")}>
            {ar.common.approve}
          </Button>
        ) : null}
        {request.status === 9 && can(actor, "finance.approve") ? (
          <Button intent="green" onClick={() => open("2")}>
            {ar.common.approve}
          </Button>
        ) : null}
        {request.status === 2 && can(actor, "procurement.approve") ? (
          <Button intent="blue" onClick={() => open("order")}>
            {ar.common.order}
          </Button>
        ) : null}
        {[3, 4, 5].includes(request.status) && can(actor, "receipts.create") ? (
          <Button intent="green" onClick={() => open("receipt")}>
            {ar.common.receive}
          </Button>
        ) : null}
        {request.status === 5 && can(actor, "procurement.approve") ? (
          <Button intent="green" onClick={() => open("6")}>
            {ar.common.finish}
          </Button>
        ) : null}
        {[1, 2, 9].includes(request.status) &&
        can(actor, "requests.approve") ? (
          <Button intent="green" onClick={() => open("overage")}>
            {ar.common.approveOverage}
          </Button>
        ) : null}
        {[1, 2, 9].includes(request.status) &&
        can(
          actor,
          request.status === 1
            ? "technical.approve"
            : request.status === 9
              ? "finance.approve"
              : "procurement.approve",
        ) ? (
          <Button intent="red" onClick={() => open("7")}>
            {ar.common.reject}
          </Button>
        ) : null}
        {[0, 1, 2, 3, 9].includes(request.status) &&
        can(actor, "requests.delete") ? (
          <Button intent="red" onClick={() => open("8")}>
            {ar.common.cancel}
          </Button>
        ) : null}
        {request.status === 7 && can(actor, "requests.edit") ? (
          <Button onClick={() => open("0")}>{ar.common.restore}</Button>
        ) : null}
      </div>
      <Modal
        title={
          mode === "order"
            ? ar.requests.procurement
            : mode === "receipt"
              ? ar.requests.newReceipt
              : ar.common.confirmation
        }
        open={!!mode}
        onOpenChange={(value) => {
          if (!value) setMode("");
        }}
        wide={mode === "receipt"}
      >
        <form onSubmit={submit} className="stack" noValidate>
          <Message error={error} />
          {mode === "order" ? (
            <>
              <div className="fields">
                <Field label={ar.fields.supplier}>
                  <Lookup
                    resource="suppliers"
                    value={supplier}
                    onChange={setSupplier}
                  />
                </Field>
                <Field label={ar.fields.expectedAt}>
                  <DateInput value={expected} onChange={setExpected} />
                </Field>
              </div>
              {lines.map((l) => (
                <Field
                  label={`${String(l.material_name)} · ${ar.fields.price}`}
                  key={l.id}
                >
                  <input
                    className="input numeric"
                    inputMode="decimal"
                    value={prices[l.id]}
                    onChange={(e) =>
                      setPrices((p) => ({ ...p, [l.id]: e.target.value }))
                    }
                  />
                </Field>
              ))}
            </>
          ) : mode === "receipt" ? (
            <>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{ar.fields.material}</th>
                      {(
                        ["accepted", "damaged", "rejected", "returned"] as const
                      ).map((f) => (
                        <th key={f}>{ar.fields[f]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id}>
                        <td>{String(l.material_name)}</td>
                        {(
                          [
                            "accepted",
                            "damaged",
                            "rejected",
                            "returned",
                          ] as const
                        ).map((f) => (
                          <td key={f}>
                            <input
                              aria-label={`${String(l.material_name)} ${ar.fields[f]}`}
                              className="input numeric"
                              style={{ minWidth: 90 }}
                              inputMode="decimal"
                              value={receipt[l.id][f]}
                              onChange={(e) =>
                                setReceipt((p) => ({
                                  ...p,
                                  [l.id]: { ...p[l.id], [f]: e.target.value },
                                }))
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Field label={ar.fields.notes}>
                <textarea
                  className="input"
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </>
          ) : ["7", "8"].includes(mode) ? (
            <Field label={ar.fields.reason}>
              <textarea
                className="input"
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          ) : (
            <p>
              {mode === "overage"
                ? ar.common.approveOverage
                : ar.statuses[Number(mode)]}
            </p>
          )}
          <div className="form-footer">
            <Button type="button" onClick={() => setMode("")}>
              {ar.common.cancel}
            </Button>
            <Button
              intent={["7", "8"].includes(mode) ? "red" : "green"}
              pending={busy}
              type="submit"
            >
              {ar.common.confirm}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
export function AttachmentUpload({ requestId }: { requestId: string }) {
  const router = useRouter(),
    [open, setOpen] = useState(false),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      title={ar.requests.attachment}
      open={open}
      onOpenChange={setOpen}
      trigger={<Button className="small">{ar.common.upload}</Button>}
    >
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!file) return;
          setBusy(true);
          setError("");
          try {
            if (
              file.size > 4 * 1024 * 1024 ||
              ![
                "application/pdf",
                "image/jpeg",
                "image/png",
                "image/webp",
              ].includes(file.type)
            )
              throw new Error(ar.errors.file);
            const form = new FormData();
            form.set("requestId", requestId);
            form.set("file", file);
            const r = await fetch("/api/attachments", {
              method: "POST",
              body: form,
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error);
            setOpen(false);
            router.refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Message error={error} />
        <Field label={ar.fields.file}>
          <FilePicker
            accept="image/jpeg,image/png,image/webp,application/pdf"
            onChange={setFile}
          />
        </Field>
        <Button type="submit" pending={busy} disabled={!file} intent="blue">
          {ar.common.upload}
        </Button>
      </form>
    </Modal>
  );
}
