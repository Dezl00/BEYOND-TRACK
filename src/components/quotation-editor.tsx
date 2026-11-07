"use client";
import { useEffect, useState } from "react";
import Decimal from "decimal.js";
import { ar } from "@/messages/ar";
import { quotationsSchema } from "@/lib/validation";
import type { Quote } from "@/lib/quotations";
import { number } from "@/lib/format";
import { useDigits } from "./format-context";
import {
  Button,
  Field,
  Lookup,
  DateInput,
  Message,
  Checkbox,
  command,
} from "./ui";
export type RequestLine = {
  id: string;
  material_name: string;
  quantity: string;
  accepted: string;
  returned: string;
  unit_name: string;
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
  onDone,
  onBusyChange,
}: {
  request: { id: string; version: number };
  lines: RequestLine[];
  quotes: Quote[];
  onDone: () => void;
  onBusyChange?: (value: boolean) => void;
}) {
  const digits = useDigits();
  const blank = (): Offer => ({
    supplierId: "",
    expectedAt: "",
    prices: lines.map((l) => ({ id: l.id, price: "" })),
  });
  const [offers, setOffers] = useState<Offer[]>(() =>
    quotes.length
      ? quotes.map((q) => ({
          supplierId: q.supplier_id,
          expectedAt: q.expected_at,
          prices: lines.map((l) => ({
            id: l.id,
            price: q.prices.find((p) => p.id === l.id)?.price || "",
          })),
        }))
      : [blank()],
  );
  const [multiple, setMultiple] = useState(quotes.length > 1),
    [selectedIndex, setSelected] = useState(
      Math.max(
        0,
        quotes.findIndex((q) => q.selected),
      ),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const shown = multiple ? offers : offers.slice(0, 1);
  function update(index: number, patch: Partial<Offer>) {
    setOffers((prev) =>
      prev.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    );
  }
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await command(
        "quotations",
        quotationsSchema.parse({
          ...request,
          offers: shown,
          selectedIndex: multiple ? selectedIndex : 0,
        }),
      );
      onDone();
    } catch (e) {
      setError(
        e instanceof Error && !("issues" in e) ? e.message : ar.errors.invalid,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <Message error={error} />
      <p className="muted">
        أدخل أسعار نفس مواد الطلب لكل مورد، وحدد العرض المرشح لاعتماد المالية.
        تعديل العروض يعيدها للاعتماد.
      </p>
      <fieldset disabled={busy} className="form-fieldset stack">
        <Checkbox
          label="إضافة أكثر من عرض سعر"
          checked={multiple}
          onChange={(e) => {
            setMultiple(e.target.checked);
            if (e.target.checked && offers.length === 1)
              setOffers([...offers, blank()]);
            if (!e.target.checked) setSelected(0);
          }}
        />
        {shown.map((offer, index) => (
          <section className="panel quote-editor" key={index}>
            <div className="panel-heading">
              <label className="row">
                <input
                  type="radio"
                  name="selected-offer"
                  checked={selectedIndex === index}
                  onChange={() => setSelected(index)}
                />
                عرض {number(index + 1, digits, 0)} ·{" "}
                {selectedIndex === index ? "مرشح للاعتماد" : "ترشيح هذا العرض"}
              </label>
              {index > 0 ? (
                <Button
                  type="button"
                  className="small"
                  onClick={() => {
                    setOffers((prev) => prev.filter((_, i) => i !== index));
                    setSelected((prev) =>
                      prev === index ? 0 : prev > index ? prev - 1 : prev,
                    );
                  }}
                >
                  حذف العرض
                </Button>
              ) : null}
            </div>
            <div className="panel-body fields">
              <Field label="المورد">
                <Lookup
                  resource="suppliers"
                  value={offer.supplierId}
                  onChange={(supplierId) => update(index, { supplierId })}
                />
              </Field>
              <Field label="تاريخ التوريد المتوقع">
                <DateInput
                  value={offer.expectedAt}
                  onChange={(expectedAt) => update(index, { expectedAt })}
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
                  {lines.map((l, lineIndex) => (
                    <tr key={l.id}>
                      <td className="wrap">{l.material_name}</td>
                      <td>
                        {number(l.quantity, digits)} {l.unit_name}
                      </td>
                      <td>
                        <input
                          className="input numeric quote-price"
                          aria-label={
                            "سعر " +
                            l.material_name +
                            " في العرض " +
                            (index + 1)
                          }
                          type="number"
                          min="0"
                          step="0.01"
                          value={offer.prices[lineIndex].price}
                          onChange={(e) =>
                            update(index, {
                              prices: offer.prices.map((p, i) =>
                                i === lineIndex
                                  ? { ...p, price: e.target.value }
                                  : p,
                              ),
                            })
                          }
                        />
                      </td>
                      <td>
                        {number(
                          new Decimal(l.quantity)
                            .times(offer.prices[lineIndex].price || 0)
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
            <div className="panel-body">
              <strong>
                الإجمالي:{" "}
                {number(
                  offer.prices
                    .reduce(
                      (sum, p) =>
                        sum.plus(
                          new Decimal(p.price || 0).times(
                            lines.find((l) => l.id === p.id)!.quantity,
                          ),
                        ),
                      new Decimal(0),
                    )
                    .toString(),
                  digits,
                  2,
                )}{" "}
                {ar.currency}
              </strong>
            </div>
          </section>
        ))}
        {multiple && offers.length < 10 ? (
          <Button type="button" onClick={() => setOffers([...offers, blank()])}>
            إضافة عرض سعر آخر
          </Button>
        ) : null}
      </fieldset>
      <div className="form-footer">
        <Button type="button" onClick={onDone} disabled={busy}>
          إلغاء
        </Button>
        <Button type="submit" intent="blue" pending={busy}>
          إرسال لاعتماد التسعير
        </Button>
      </div>
    </form>
  );
}
