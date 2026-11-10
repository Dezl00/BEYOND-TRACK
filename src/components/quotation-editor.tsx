"use client";
import type { RequestAttachment } from "@/lib/attachments";
import StageAttachments, { type UploadState } from "./stage-attachments";
import { NumberField } from "./number-field";
import { useEffect, useState } from "react";
import Decimal from "decimal.js";
import { ar } from "@/messages/ar";
import { quotationsSchema } from "@/lib/validation";
import type { Quote } from "@/lib/quotations";
import { decimalText, number } from "@/lib/format";
import { useDigits } from "./format-context";
import { Button, Field, Lookup, DateInput, Message, command } from "./ui";
export type RequestLine = {
  id: string;
  material_name: string;
  quantity: string;
  accepted: string;
  returned: string;
  unit_name: string;
  review_status?: number;
  review_note?: string;
};
type Offer = {
  supplierId: string;
  expectedAt: string;
  prices: { id: string; price: string }[];
};
export function QuoteSummary({
  quotes,
  lines,
}: {
  quotes: Quote[];
  lines: RequestLine[];
}) {
  const digits = useDigits();
  if (!quotes.length) return null;
  return (
    <section className="stack" aria-label="عروض الأسعار">
      {quotes.map((q, i) => (
        <div className="panel" key={q.id}>
          <div className="panel-heading">
            <h3>
              عرض {number(i + 1, digits, 0)} · {q.supplier_name}
            </h3>
            {q.selected ? (
              <span className="badge green">
                {q.approved_by ? "العرض المعتمد" : "العرض المرشح"}
              </span>
            ) : null}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>الكمية</th>
                  <th>سعر الوحدة</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {q.prices.map((p) => (
                  <tr key={p.id}>
                    <td className="wrap">
                      {lines.find((l) => l.id === p.id)?.material_name ||
                        "مادة"}
                    </td>
                    <td>{number(p.quantity, digits)}</td>
                    <td>{number(p.price, digits, 2)}</td>
                    <td>
                      {number(
                        new Decimal(p.quantity).times(p.price).toString(),
                        digits,
                        2,
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="panel-body row between">
            <span>
              التوريد المتوقع: <bdi>{q.expected_at}</bdi>
            </span>
            <strong>
              الإجمالي:{" "}
              {number(
                q.prices
                  .reduce(
                    (n, p) => n.plus(new Decimal(p.price).times(p.quantity)),
                    new Decimal(0),
                  )
                  .toString(),
                digits,
                2,
              )}{" "}
              {ar.currency}
            </strong>
          </div>
        </div>
      ))}
    </section>
  );
}
export function QuotationEditor({
  request,
  lines,
  quotes,
  attachments = [],
  onDone,
  onBusyChange,
}: {
  request: { id: string; version: number; pricing_revision?: number };
  lines: RequestLine[];
  quotes: Quote[];
  attachments?: RequestAttachment[];
  onDone: () => void;
  onBusyChange?: (value: boolean) => void;
}) {
  const digits = useDigits();
  const selected = quotes.find((q) => q.selected) || quotes[0];
  const [offer, setOffer] = useState<Offer>(() => ({
    supplierId: selected?.supplier_id || "",
    expectedAt: selected?.expected_at || "",
    prices: lines.map((line) => ({
      id: line.id,
      price: decimalText(selected?.prices.find((p) => p.id === line.id)?.price),
    })),
  }));
  const [uploadKey] = useState(() => crypto.randomUUID());
  const currentFiles = attachments.filter((f) =>
    selected?.attachment_ids?.includes(f.id),
  );
  const [primary, setPrimary] = useState<UploadState>({
    ids: [],
    ready: false,
    uploading: false,
  });
  const [alternatives, setAlternatives] = useState<UploadState>({
    ids: [],
    ready: false,
    uploading: false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const uploading = primary.uploading || alternatives.uploading;
  useEffect(() => {
    onBusyChange?.(busy || uploading);
    return () => onBusyChange?.(false);
  }, [busy, uploading, onBusyChange]);
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!primary.ready || !alternatives.ready || !primary.ids.length || busy)
      return;
    setBusy(true);
    setError("");
    try {
      await command(
        "quotations",
        quotationsSchema.parse({
          id: request.id,
          version: request.version,
          offers: [offer],
          selectedIndex: 0,
          uploadKey,
          attachmentIds: primary.ids,
          alternativeAttachmentIds: alternatives.ids,
        }),
      );
      onDone();
    } catch (error) {
      setError(
        error instanceof Error && !("issues" in error)
          ? error.message
          : ar.errors.invalid,
      );
    } finally {
      setBusy(false);
    }
  }
  const total = offer.prices.reduce(
    (sum, p) =>
      sum.plus(
        new Decimal(p.price || 0).times(
          lines.find((l) => l.id === p.id)!.quantity,
        ),
      ),
    new Decimal(0),
  );
  return (
    <form className="stack" noValidate onSubmit={submit}>
      <Message error={error} />
      <fieldset className="form-fieldset stack" disabled={busy}>
        <div className="fields">
          <Field label="المورد">
            <Lookup
              resource="suppliers"
              value={offer.supplierId}
              initialLabel={selected?.supplier_name}
              onChange={(supplierId) =>
                setOffer((prev) => ({ ...prev, supplierId }))
              }
            />
          </Field>
          <Field label="تاريخ التوريد المتوقع">
            <DateInput
              value={offer.expectedAt}
              onChange={(expectedAt) =>
                setOffer((prev) => ({ ...prev, expectedAt }))
              }
            />
          </Field>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>المادة</th>
                <th>الكمية</th>
                <th>سعر الوحدة</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="wrap">{line.material_name}</td>
                  <td>
                    {number(line.quantity, digits)} {line.unit_name}
                  </td>
                  <td>
                    <NumberField
                      className="quote-price"
                      ariaLabel={"سعر " + line.material_name}
                      precision={2}
                      value={offer.prices[index].price}
                      onChange={(price) =>
                        setOffer((prev) => ({
                          ...prev,
                          prices: prev.prices.map((p) =>
                            p.id === line.id ? { ...p, price } : p,
                          ),
                        }))
                      }
                    />
                  </td>
                  <td>
                    {number(
                      new Decimal(line.quantity)
                        .times(offer.prices[index].price || 0)
                        .toString(),
                      digits,
                      2,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <strong>
          الإجمالي {number(total.toString(), digits, 2)} {ar.currency}
        </strong>
        <div className="fields">
          <StageAttachments
            requestId={request.id}
            uploadKey={uploadKey}
            purpose="quotation"
            label="عرض السعر"
            initial={currentFiles.filter((f) => f.purpose === "quotation")}
            onChange={setPrimary}
            disabled={busy}
          />
          <StageAttachments
            requestId={request.id}
            uploadKey={uploadKey}
            purpose="alternative"
            label="عروض أسعار أخرى"
            initial={currentFiles.filter((f) => f.purpose === "alternative")}
            onChange={setAlternatives}
            disabled={busy}
          />
        </div>
      </fieldset>
      <div className="form-footer">
        <Button type="button" onClick={onDone} disabled={busy || uploading}>
          إلغاء
        </Button>
        <Button
          type="submit"
          intent="blue"
          pending={busy}
          disabled={
            uploading ||
            !primary.ready ||
            !alternatives.ready ||
            !primary.ids.length
          }
        >
          إرسال لمدير الحسابات
        </Button>
      </div>
    </form>
  );
}
