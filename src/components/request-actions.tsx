"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ar } from "@/messages/ar";
import { type Actor, can } from "@/lib/domain";
import type { Quote } from "@/lib/quotations";
import { orderSchema, transitionSchema } from "@/lib/validation";
import { Button, Modal, Field, Message, command } from "./ui";
import {
  QuotationEditor,
  QuoteSummary,
  type RequestLine,
} from "./quotation-editor";
import ReceiptForm from "./receipt-form";
export function RequestActions({
  actor,
  request,
  lines,
  quotes,
  pendingOverage,
}: {
  actor: Actor;
  request: { id: string; status: number; version: number };
  lines: RequestLine[];
  quotes: Quote[];
  pendingOverage: boolean;
}) {
  const router = useRouter(),
    [mode, setMode] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reason, setReason] = useState("");
  function open(value: string) {
    setMode(value);
    setError("");
    setReason("");
  }
  function done() {
    setMode("");
    router.refresh();
  }
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "order")
        await command(
          "order",
          orderSchema.parse({ id: request.id, version: request.version }),
        );
      else if (mode === "overage") await command("overage", { id: request.id });
      else
        await command(
          "transition",
          transitionSchema.parse({
            id: request.id,
            version: request.version,
            status: mode === "returnPricing" ? 2 : Number(mode),
            reason,
          }),
        );
      done();
    } catch (e) {
      setError(
        e instanceof Error && !("issues" in e) ? e.message : ar.errors.invalid,
      );
    } finally {
      setBusy(false);
    }
  }
  const approvalPermission =
    request.status === 1
      ? "technical.approve"
      : [9, 10].includes(request.status)
        ? "finance.approve"
        : "procurement.approve";
  return (
    <>
      <div className="row">
        {request.status === 0 && can(actor, "requests.create") ? (
          <Button intent="blue" onClick={() => open("1")}>
            {ar.common.submit}
          </Button>
        ) : null}
        {!pendingOverage &&
        request.status === 1 &&
        can(actor, "technical.approve") ? (
          <Button intent="blue" onClick={() => open("9")}>
            {ar.common.approve}
          </Button>
        ) : null}
        {!pendingOverage &&
        request.status === 9 &&
        can(actor, "finance.approve") ? (
          <Button intent="green" onClick={() => open("2")}>
            {ar.common.approve}
          </Button>
        ) : null}
        {!pendingOverage &&
        [2, 10, 11].includes(request.status) &&
        can(actor, "procurement.approve") &&
        can(actor, "procurement.edit") ? (
          <Button intent="blue" onClick={() => open("quotes")}>
            {request.status === 2 ? "تسجيل عروض الأسعار" : "تعديل عروض الأسعار"}
          </Button>
        ) : null}
        {request.status === 10 && can(actor, "finance.approve") ? (
          <>
            {!pendingOverage && (
              <Button intent="green" onClick={() => open("11")}>
                اعتماد التسعير
              </Button>
            )}
            <Button onClick={() => open("returnPricing")}>
              إرجاع التسعير للمشتريات
            </Button>
          </>
        ) : null}
        {!pendingOverage &&
        request.status === 11 &&
        can(actor, "procurement.approve") &&
        can(actor, "procurement.edit") ? (
          <Button intent="blue" onClick={() => open("order")}>
            {ar.common.order}
          </Button>
        ) : null}
        {[3, 4, 5].includes(request.status) && can(actor, "receipts.create") ? (
          <Button intent="green" onClick={() => open("receipt")}>
            {ar.common.receive}
          </Button>
        ) : null}
        {!pendingOverage &&
        request.status === 5 &&
        can(actor, "procurement.approve") ? (
          <Button intent="green" onClick={() => open("6")}>
            {ar.common.finish}
          </Button>
        ) : null}
        {pendingOverage &&
        [1, 2, 5, 9, 10, 11].includes(request.status) &&
        can(actor, "requests.approve") ? (
          <Button intent="green" onClick={() => open("overage")}>
            {ar.common.approveOverage}
          </Button>
        ) : null}
        {[1, 2, 9, 10].includes(request.status) &&
        can(actor, approvalPermission) ? (
          <Button intent="red" onClick={() => open("7")}>
            {ar.common.reject}
          </Button>
        ) : null}
        {[0, 1, 2, 3, 9, 10, 11].includes(request.status) &&
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
          mode === "quotes"
            ? "عروض الأسعار"
            : mode === "receipt"
              ? ar.requests.newReceipt
              : ar.common.confirmation
        }
        open={!!mode}
        onOpenChange={(v) => {
          if (!v && !busy) setMode("");
        }}
        wide={["quotes", "receipt", "11", "order"].includes(mode)}
      >
        {mode === "quotes" ? (
          <QuotationEditor
            request={request}
            lines={lines}
            quotes={quotes}
            onDone={done}
            onBusyChange={setBusy}
          />
        ) : mode === "receipt" ? (
          <ReceiptForm
            requestId={request.id}
            lines={lines}
            onDone={done}
            onBusyChange={setBusy}
          />
        ) : (
          <form className="stack" noValidate onSubmit={submit}>
            <Message error={error} />
            {["7", "8", "returnPricing"].includes(mode) ? (
              <Field label={ar.fields.reason}>
                <textarea
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                />
              </Field>
            ) : ["11", "order"].includes(mode) ? (
              <>
                <p>
                  {mode === "11"
                    ? "اعتماد العرض المرشح بالتكلفة المعروضة؟"
                    : "تأكيد التوريد وفق العرض المعتمد؟"}
                </p>
                <QuoteSummary
                  quotes={quotes.filter((q) => q.selected)}
                  lines={lines}
                />
              </>
            ) : (
              <p>
                {mode === "overage"
                  ? ar.common.approveOverage
                  : ar.statuses[Number(mode)]}
              </p>
            )}
            <div className="form-footer">
              <Button type="button" onClick={done} disabled={busy}>
                {ar.common.cancel}
              </Button>
              <Button
                type="submit"
                intent={["7", "8"].includes(mode) ? "red" : "green"}
                pending={busy}
              >
                {ar.common.confirm}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
