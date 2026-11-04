import { z } from "zod";
import { cache } from "react";
import { sql, rows, one } from "@/db";
import type { Actor } from "@/lib/domain";
import { projectScope, requestScope, requirePermission } from "./access";
import { AppError } from "./errors";
import { decodeCursor, page, type Query } from "./queries";
import {
  type ConsumptionRow,
  type ProjectReportQuery,
  riyadhToday,
} from "@/lib/reporting";

export type ReportContext = {
  id: string;
  code: string;
  name: string;
  location: string;
  archived: boolean;
  selected: { id: string; code: string; name: string }[];
};
export const reportContext = cache(
  async (actor: Actor, q: ProjectReportQuery) => {
    requirePermission(actor, "reports.view");
    if (q.from && q.from > (q.to || riyadhToday())) throw new AppError("date");
    const context =
      await one<ReportContext>(sql`SELECT p.id,p.code,p.name,p.location,p.archived,
    ${
      q.items.length
        ? sql`(SELECT COALESCE(jsonb_agg(jsonb_build_object('id',b.id,'code',b.code,'name',b.name) ORDER BY b.code,b.id),'[]'::jsonb) FROM boq_items b WHERE b.project_id=p.id AND b.id IN(${sql.join(
            q.items.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}))`
        : sql`'[]'::jsonb`
    } selected
    FROM projects p WHERE p.id=${q.project}::uuid AND ${projectScope(actor)}`);
    if (!context) throw new AppError("project", 403);
    if (context.selected.length !== q.items.length)
      throw new AppError("project", 403);
    return context;
  },
);

// This permission never expands project or request visibility. An engineer still
// sees only their own requests unless requests.view_all is explicitly granted.
function reportCte(actor: Actor, q: ProjectReportQuery) {
  const until = q.to || riyadhToday();
  const since = q.from ? sql`${q.from}::date` : sql`'-infinity'::date`;
  return sql`WITH target AS MATERIALIZED (
    SELECT m.id,m.name,m.quantity allocated,b.id boq_id,b.code,b.name boq_name,
      un.name unit_name
    FROM materials m JOIN boq_items b ON b.id=m.boq_item_id
    JOIN units un ON un.id=b.unit_id LEFT JOIN boq_items parent ON parent.id=b.parent_id
    WHERE b.project_id=${q.project}::uuid AND ${projectScope(actor, sql`b.project_id`)}
    ${
      q.items.length
        ? sql`AND (b.id IN(${sql.join(
            q.items.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}) OR b.parent_id IN(${sql.join(
            q.items.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}) OR parent.parent_id IN(${sql.join(
            q.items.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}))`
        : sql``
    }
    AND (${q.q}='' OR m.name ILIKE ${"%" + q.q + "%"} OR b.name ILIKE ${"%" + q.q + "%"} OR b.code ILIKE ${"%" + q.q + "%"})
  ), permitted_requests AS MATERIALIZED (
    SELECT r.id,COALESCE(r.submitted_at,r.created_at) occurred_at
    FROM purchase_requests r WHERE r.project_id=${q.project}::uuid AND r.status IN(1,2,3,4,5,6,9)
      AND ${requestScope(actor)}
      AND EXISTS(SELECT 1 FROM request_lines l JOIN target t ON t.id=l.material_id WHERE l.request_id=r.id)
  ), orders AS MATERIALIZED (
    SELECT l.material_id, SUM(l.quantity) requested,
      SUM(l.quantity) FILTER(WHERE (r.occurred_at AT TIME ZONE 'Asia/Riyadh')::date>=${since}) period_requested
    FROM request_lines l JOIN permitted_requests r ON r.id=l.request_id JOIN target t ON t.id=l.material_id
    WHERE (r.occurred_at AT TIME ZONE 'Asia/Riyadh')::date<=${until}::date GROUP BY l.material_id
  ), movements AS MATERIALIZED (
    SELECT c.id,c.created_at,l.material_id,rl.accepted,rl.returned,rl.damaged,rl.rejected
    FROM receipts c JOIN permitted_requests r ON r.id=c.request_id
    JOIN receipt_lines rl ON rl.receipt_id=c.id JOIN request_lines l ON l.id=rl.request_line_id
    JOIN target t ON t.id=l.material_id
    WHERE (c.created_at AT TIME ZONE 'Asia/Riyadh')::date<=${until}::date
  ), delivered AS (
    SELECT material_id,SUM(accepted-returned) received,
      SUM(accepted-returned) FILTER(WHERE (created_at AT TIME ZONE 'Asia/Riyadh')::date>=${since}) period_received,
      SUM(damaged) damaged,SUM(rejected) rejected,SUM(returned) returned
    FROM movements GROUP BY material_id
  ), data AS MATERIALIZED (
    SELECT t.*,COALESCE(o.requested,0) requested,COALESCE(o.period_requested,0) period_requested,
      COALESCE(d.received,0) received,COALESCE(d.period_received,0) period_received,
      COALESCE(d.damaged,0) damaged,COALESCE(d.rejected,0) rejected,COALESCE(d.returned,0) returned
    FROM target t LEFT JOIN orders o ON o.material_id=t.id LEFT JOIN delivered d ON d.material_id=t.id
  )`;
}
const rowSelect = sql`id,name,boq_id,code,boq_name,unit_name,
  allocated::text,requested::text,received::text,period_requested::text,period_received::text,
  damaged::text,rejected::text,returned::text`;
const reportCursorSchema = z.object({
  id: z.uuid(),
  item: z.uuid(),
  code: z.string().max(60),
  name: z.string().max(200),
});
export function decodeReportCursor(value?: string) {
  if (!value) return null;
  try {
    return reportCursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString()),
    );
  } catch {
    throw new AppError("invalid");
  }
}
function encodeReportCursor(row: ConsumptionRow) {
  return Buffer.from(
    JSON.stringify({
      id: row.id,
      item: row.boq_id,
      code: row.code,
      name: row.name,
    }),
  ).toString("base64url");
}
export async function consumptionPage(
  actor: Actor,
  q: ProjectReportQuery,
  size: 25 | 200 = 25,
) {
  await reportContext(actor, q);
  const cursor = decodeReportCursor(q.cursor);
  const data =
    await rows<ConsumptionRow>(sql`${reportCte(actor, q)} SELECT ${rowSelect} FROM data
    ${cursor ? sql`WHERE (code,boq_id,name,id)>(${cursor.code},${cursor.item}::uuid,${cursor.name},${cursor.id}::uuid)` : sql``}
    ORDER BY code,boq_id,name,id LIMIT ${size + 1}`);
  const items = data.slice(0, size);
  return {
    items,
    next: data.length > size ? encodeReportCursor(items.at(-1)!) : null,
  };
}
export type ReportOverview = {
  items: number;
  materials: number;
  requested_over: number;
  received_over: number;
  untouched: number;
  within_limit: number;
  request_count: number;
  receipt_count: number;
  top: ConsumptionRow[];
  trend: { month: string; requests: number; receipts: number }[];
};
export async function reportOverview(actor: Actor, q: ProjectReportQuery) {
  await reportContext(actor, q);
  const until = q.to || riyadhToday();
  const since = q.from ? sql`${q.from}::date` : sql`'-infinity'::date`;
  return (await one<ReportOverview>(sql`${reportCte(actor, q)},
    period_requests AS (SELECT * FROM permitted_requests r WHERE (r.occurred_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN ${since} AND ${until}::date),
    period_receipts AS (SELECT DISTINCT id,created_at FROM movements WHERE (created_at AT TIME ZONE 'Asia/Riyadh')::date>=${since}),
    months AS (SELECT generate_series(date_trunc('month',${until}::date)-interval '11 months',date_trunc('month',${until}::date),interval '1 month') AS bucket),
    trend_requests AS (SELECT date_trunc('month',occurred_at AT TIME ZONE 'Asia/Riyadh') AS bucket,COUNT(*)::int count FROM period_requests WHERE occurred_at>=(${until}::date-interval '12 months') GROUP BY 1),
    trend_receipts AS (SELECT date_trunc('month',created_at AT TIME ZONE 'Asia/Riyadh') AS bucket,COUNT(*)::int count FROM period_receipts WHERE created_at>=(${until}::date-interval '12 months') GROUP BY 1)
    SELECT COUNT(DISTINCT boq_id)::int items,COUNT(*)::int materials,
      COUNT(*) FILTER(WHERE requested>allocated)::int requested_over,
      COUNT(*) FILTER(WHERE received>allocated)::int received_over,
      COUNT(*) FILTER(WHERE received<=0)::int untouched,
      COUNT(*) FILTER(WHERE received>0 AND received<=allocated)::int within_limit,
      (SELECT COUNT(*)::int FROM period_requests) request_count,
      (SELECT COUNT(*)::int FROM period_receipts) receipt_count,
      (SELECT COALESCE(jsonb_agg(t),'[]'::jsonb) FROM (SELECT ${rowSelect} FROM data ORDER BY GREATEST(received/allocated,requested/allocated) DESC,code,boq_id,name,id LIMIT 6)t) top,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('month',to_char(m.bucket,'YYYY-MM'),'requests',COALESCE(r.count,0),'receipts',COALESCE(c.count,0)) ORDER BY m.bucket),'[]'::jsonb) FROM months m LEFT JOIN trend_requests r ON r.bucket=m.bucket LEFT JOIN trend_receipts c ON c.bucket=m.bucket) trend
    FROM data`))!;
}
export async function reportOptions(
  actor: Actor,
  kind: "report-projects" | "report-items",
  q: Query,
) {
  requirePermission(actor, "reports.view");
  const c = decodeCursor(q.cursor);
  if (kind === "report-projects")
    return page(
      await rows<{ id: string; code: string; name: string }>(
        sql`SELECT p.id,p.code,p.name FROM projects p WHERE ${projectScope(actor)}
      AND (${q.q}='' OR p.name ILIKE ${"%" + q.q + "%"} OR p.code ILIKE ${"%" + q.q + "%"})
      ${c ? sql`AND p.id>${c.id}::uuid` : sql``} ORDER BY p.id LIMIT 26`,
      ),
    );
  if (!q.project) throw new AppError("invalid");
  await reportContext(actor, { project: q.project, items: [], q: "" });
  return page(
    await rows<{ id: string; code: string; name: string }>(sql`
    SELECT b.id,b.code,b.name FROM boq_items b WHERE b.project_id=${q.project}::uuid
      AND (${q.q}='' OR b.name ILIKE ${"%" + q.q + "%"} OR b.code ILIKE ${"%" + q.q + "%"})
      ${c ? sql`AND b.id>${c.id}::uuid` : sql``} ORDER BY b.id LIMIT 26`),
  );
}
