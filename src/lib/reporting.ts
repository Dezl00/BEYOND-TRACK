import Decimal from "decimal.js";
import { z } from "zod";
import { dateOnly, uuid } from "./validation";
import { ar } from "@/messages/ar";

export const reportQuerySchema = z
  .object({
    project: uuid.optional(),
    items: z
      .string()
      .max(1200)
      .optional()
      .transform((value) => (value ? value.split(",") : []))
      .pipe(z.array(uuid).max(30))
      .transform((value) => [...new Set(value)]),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
    q: z.string().trim().max(100).default(""),
    cursor: z.string().max(1400).optional(),
  })
  .refine((q) => !q.from || q.from <= (q.to || riyadhToday()), {
    message: ar.errors.date,
    path: ["to"],
  });
export type ReportQuery = z.infer<typeof reportQuerySchema>;
export type ProjectReportQuery = ReportQuery & { project: string };

export type ConsumptionRow = {
  id: string;
  name: string;
  boq_id: string;
  code: string;
  boq_name: string;
  unit_name: string;
  allocated: string;
  requested: string;
  received: string;
  period_requested: string;
  period_received: string;
  damaged: string;
  rejected: string;
  returned: string;
};
const excess = (value: string, limit: string) =>
  Decimal.max(new Decimal(value).minus(limit), 0).toFixed(3);
export function consumption(
  row: Pick<ConsumptionRow, "allocated" | "requested" | "received">,
) {
  const limit = new Decimal(row.allocated);
  const percent = (value: string) =>
    limit.gt(0) ? new Decimal(value).div(limit).mul(100).toFixed(2) : "0.00";
  const requestedOverage = excess(row.requested, row.allocated);
  const receivedOverage = excess(row.received, row.allocated);
  return {
    requestedRate: percent(row.requested),
    receivedRate: percent(row.received),
    requestedOverage,
    receivedOverage,
    requestedOverageRate: percent(requestedOverage),
    receivedOverageRate: percent(receivedOverage),
  };
}
export function percent(value: string | number, digits = 0) {
  return new Intl.NumberFormat(digits ? "ar-SA-u-nu-arab" : "ar-SA-u-nu-latn", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(Number(value) / 100);
}
export function riyadhToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export const printSectionKeys = [
  "materials",
  "receipts",
  "attachments",
  "timeline",
] as const;
export const requestPrintSchema = z
  .object({
    materials: z.enum(["0", "1"]).default("1"),
    receipts: z.enum(["0", "1"]).default("1"),
    attachments: z.enum(["0", "1"]).default("0"),
    timeline: z.enum(["0", "1"]).default("0"),
    prices: z.enum(["0", "1"]).default("0"),
    photos: z.enum(["0", "1"]).default("0"),
  })
  .refine(
    (value) => printSectionKeys.some((key) => value[key] === "1"),
    ar.printing.noSections,
  );
export type RequestPrintOptions = z.infer<typeof requestPrintSchema>;
