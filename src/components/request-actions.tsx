"use client";
import { useLanguage } from "@/components/language-context";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  type Actor,
  can,
  canApproveOverage,
  approvalPermission,
  transitions,
} from "@/lib/domain";
import type { Quote } from "@/lib/quotations";
import type { RequestAttachment } from "@/lib/attachments";
import { transitionSchema } from "@/lib/validation";
import { Button, Modal, Field, Message, command } from "./ui";
import {
  QuotationEditor,
  QuoteSummary,
  type RequestLine,
} from "./quotation-editor";
import ReceiptForm from "./receipt-form";
import TechnicalReview from "./technical-review";
import PaymentForm from "./payment-form";
export function RequestActions({
  actor,
  request,
  lines,
  quotes,
  attachments = [],
  pendingOverage,
}: {
  actor: Pick<Actor, "id" | "is_owner" | "permissions" | "workflow_role">;
  request: {
    id: string;
    status: number;
    version: number;
    pricing_revision?: number;
    created_by?: string;
  };
  lines: RequestLine[];
  quotes: Quote[];
  attachments?: RequestAttachment[];
  pendingOverage: boolean;
}) {
  const { m: msg } = useLanguage();
  
  const router = useRouter();
  const [mode, setMode] = useState(""),
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
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "overage") await command("overage", { id: request.id });
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
  const status = request.status;
  const approver = can(actor, approvalPermission(status));
  const own = actor.is_owner || request.created_by === actor.id;
  const nextApproval: Record<number, number> = { 12: 1, 13: 1, 15: 2, 5: 6 };
  return (
    <>
      <div className="row">
        {status === 0 && own && can(actor, "requests.create") ? (
          <Button intent="blue" onClick={() => open("12")}>
            {msg.common.submit}
          </Button>
        ) : null}
        {!pendingOverage && nextApproval[status] !== undefined && approver ? (
          <Button
            intent="green"
            onClick={() => open(String(nextApproval[status]))}
          >
            {status === 5 ? msg.common.finish : msg.common.approve}
          </Button>
        ) : null}
        {!pendingOverage && status === 1 && approver ? (
          <Button intent="blue" onClick={() => open("technical")}>{msg.interface.reviewApprove} </Button>
        ) : null}
        {status === 12 && approver ? (
          <Button onClick={() => open("13")}>{msg.interface.holdRequest}</Button>
        ) : null}
        {!pendingOverage &&
        status === 2 &&
        can(actor, "procurement.edit") &&
        approver ? (
          <Button intent="blue" onClick={() => open("quotes")}>{msg.interface.recordQuote} </Button>
        ) : null}
        {status === 10 && approver ? (
          <>
            {!pendingOverage ? (
              <Button intent="green" onClick={() => open("11")}>{msg.interface.approvePricing} </Button>
            ) : null}
            <Button onClick={() => open("returnPricing")}>{msg.interface.returnProcurement} </Button>
          </>
        ) : null}
        {!pendingOverage && status === 11 && approver ? (
          <Button intent="green" onClick={() => open("payment")}>{msg.interface.confirmPayment} </Button>
        ) : null}
        {[3, 4, 5].includes(status) && can(actor, "receipts.create") ? (
          <Button intent="green" onClick={() => open("receipt")}>
            {msg.common.receive}
          </Button>
        ) : null}
        {pendingOverage &&
        [1, 2, 5, 10, 11, 12, 13, 15].includes(status) &&
        canApproveOverage(actor) ? (
          <Button intent="green" onClick={() => open("overage")}>
            {msg.common.approveOverage}
          </Button>
        ) : null}
        {[12, 13, 15].includes(status) && approver ? (
          <Button intent="red" onClick={() => open("7")}>
            {msg.common.reject}
          </Button>
        ) : null}
        {transitions[status]?.includes(8) && can(actor, "requests.delete") ? (
          <Button intent="red" onClick={() => open("8")}>
            {msg.common.cancel}
          </Button>
        ) : null}
        {status === 7 && own && can(actor, "requests.edit") ? (
          <Button onClick={() => open("0")}>{msg.common.restore}</Button>
        ) : null}
      </div>
      <Modal
        title={
          mode === "technical"
            ? msg.interface.reviewItems
            : mode === "quotes"
              ? msg.interface.quotation
              : mode === "payment"
                ? msg.interface.payment
                : mode === "receipt"
                  ? msg.requests.newReceipt
                  : msg.common.confirmation
        }
        open={!!mode}
        onOpenChange={(value) => {
          if (!value && !busy) setMode("");
        }}
        wide={["technical", "quotes", "payment", "receipt", "11"].includes(
          mode,
        )}
      >
        {mode === "technical" ? (
          <TechnicalReview
            request={request}
            lines={lines}
            onDone={done}
            onBusyChange={setBusy}
          />
        ) : mode === "quotes" ? (
          <QuotationEditor
            request={request}
            lines={lines}
            quotes={quotes}
            attachments={attachments}
            onDone={done}
            onBusyChange={setBusy}
          />
        ) : mode === "payment" ? (
          <PaymentForm
            request={request}
            quotes={quotes}
            lines={lines}
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
            {["7", "8", "13", "returnPricing"].includes(mode) ? (
              <Field label={msg.fields.reason}>
                <textarea
                  className="input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                  required
                />
              </Field>
            ) : mode === "11" ? (
              <>
                <QuoteSummary
                  quotes={quotes.filter((q) => q.selected)}
                  lines={lines}
                />
                {attachments
                  .filter((f) =>
                    quotes.some(
                      (q) => q.selected && q.attachment_ids?.includes(f.id),
                    ),
                  )
                  .map((f) => (
                    <a
                      key={f.id}
                      className="attachment"
                      href={`/api/attachments/${f.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {f.purpose === "alternative"
                        ? msg.interface.otherQuote
                        : msg.interface.quotation}{" "}
                      · {f.name}
                    </a>
                  ))}
              </>
            ) : (
              <p>
                {mode === "overage"
                  ? msg.common.approveOverage
                  : msg.statuses[Number(mode)]}
              </p>
            )}
            <div className="form-footer">
              <Button type="button" onClick={done} disabled={busy}>
                {msg.common.cancel}
              </Button>
              <Button
                type="submit"
                intent={["7", "8"].includes(mode) ? "red" : "green"}
                pending={busy}
              >
                {msg.common.confirm}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
