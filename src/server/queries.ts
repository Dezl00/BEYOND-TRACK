import type { Quote } from "@/lib/quotations";
import { z } from "zod";
import { db, rows, one, sql } from "@/db";
import { type Actor, can, canViewPrices } from "@/lib/domain";
import { listQuerySchema } from "@/lib/validation";
import {
  requestScope,
  projectScope,
  requirePermission,
  requireRequest,
} from "./access";
import { AppError } from "./errors";
import { ar } from "@/messages/ar";
export type Query = z.infer<typeof listQuerySchema>;
export const pageSize = 25;
export type RecordRow = Record<string, unknown> & { id: string; name?: string };
export function decodeCursor(value?: string) {
  if (!value) return null;
  try {
    return z
      .object({ id: z.uuid(), at: z.string().optional() })
      .parse(JSON.parse(Buffer.from(value, "base64url").toString()));
  } catch {
    throw new AppError("invalid");
  }
}
export function page<T extends { id: string }>(data: T[], dated = false) {
  const more = data.length > pageSize,
    items = data.slice(0, pageSize),
    last = items.at(-1);
  return {
    items,
    next:
      more && last
        ? Buffer.from(
            JSON.stringify({
              id: last.id,
              ...(dated
                ? { at: (last as T & { created_at: Date }).created_at }
                : {}),
            }),
          ).toString("base64url")
        : null,
  };
}
export async function projectOptions(
  a: Actor,
  q = "",
  cursor?: string,
  selectable = false,
) {
  requirePermission(a, "projects.view");
  const c = decodeCursor(cursor);
  return page(
    await rows<RecordRow>(
      sql`SELECT p.id,p.name,p.code,p.location,p.archived FROM projects p WHERE ${projectScope(a)} ${selectable ? sql`AND p.archived=false` : sql``} AND (${q}='' OR p.name ILIKE ${"%" + q + "%"} OR p.code ILIKE ${"%" + q + "%"}) ${c ? sql`AND p.id>${c.id}::uuid` : sql``} ORDER BY p.id LIMIT 26`,
    ),
  );
}
export async function listRequests(a: Actor, q: Query, mode = "requests") {
  requirePermission(a, `${mode}.view`);
  const c = decodeCursor(q.cursor);
  return page(
    await rows<RecordRow>(
      sql`SELECT r.id,r.number,r.status,r.created_at,r.expected_at,r.version,r.project_id,p.name project_name,u.name created_by_name,s.name supplier_name,(SELECT COUNT(*)::int FROM request_lines WHERE request_id=r.id) line_count FROM purchase_requests r JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=r.created_by LEFT JOIN suppliers s ON s.id=r.supplier_id WHERE ${requestScope(a)} ${q.project ? sql`AND r.project_id=${q.project}` : sql``} ${q.status !== undefined ? sql`AND r.status=${q.status}` : mode === "procurement" ? sql`AND r.status IN(2,3,4,5,10,11)` : mode === "technical" ? sql`AND r.status=1` : mode === "finance" ? sql`AND r.status IN(9,10)` : mode === "receipts" ? sql`AND r.status BETWEEN 3 AND 6` : sql``} AND (${q.q}='' OR r.number::text ILIKE ${"%" + q.q + "%"} OR p.name ILIKE ${"%" + q.q + "%"}) ${c ? sql`AND (r.created_at,r.id)<(${c.at}::timestamptz,${c.id}::uuid)` : sql``} ORDER BY r.created_at DESC,r.id DESC LIMIT 26`,
    ),
    true,
  );
}
export async function dashboard(a: Actor, project?: string) {
  requirePermission(a, "requests.view");
  const scope = sql`${requestScope(a)} ${project ? sql`AND r.project_id=${project}::uuid` : sql``}`;
  const [stats, latest, quantities] = await Promise.all([
    one<{ waiting: number; overdue: number; open: number; complete: number }>(
      sql`SELECT COUNT(*) FILTER(WHERE r.status IN(1,2,9,10,11))::int waiting,COUNT(*) FILTER(WHERE r.status IN(3,4) AND r.expected_at<to_char(now() AT TIME ZONE 'Asia/Riyadh','YYYY-MM-DD'))::int overdue,COUNT(*) FILTER(WHERE (r.status BETWEEN 1 AND 4 OR r.status IN(9,10,11)))::int open,COUNT(*) FILTER(WHERE r.status IN(5,6))::int complete FROM purchase_requests r WHERE ${scope}`,
    ),
    listRequests(a, { q: "", project }),
    rows<{ id: string; name: string; requested: string; received: string }>(
      sql`SELECT un.id,un.name,SUM(l.quantity)::text requested,SUM(COALESCE(rec.net,0))::text received FROM request_lines l JOIN purchase_requests r ON r.id=l.request_id JOIN materials m ON m.id=l.material_id JOIN boq_items b ON b.id=m.boq_item_id JOIN units un ON un.id=b.unit_id LEFT JOIN LATERAL (SELECT SUM(accepted-returned) net FROM receipt_lines WHERE request_line_id=l.id) rec ON true WHERE ${scope} AND (r.status BETWEEN 1 AND 6 OR r.status IN(9,10,11)) GROUP BY un.id,un.name ORDER BY un.name LIMIT 25`,
    ),
  ]);
  return { stats: stats!, latest: latest.items.slice(0, 8), quantities };
}
export async function requestDetail(a: Actor, id: string, cursor?: string) {
  const r = await requireRequest(a, id);
  const c = decodeCursor(cursor);
  const [detail, lines, history, files, receipts, quotes] = await Promise.all([
    one<{
      id: string;
      project_name: string;
      created_by_name: string;
      supplier_name: string | null;
    }>(
      sql`SELECT r.id,p.name project_name,u.name created_by_name,s.name supplier_name FROM purchase_requests r JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=r.created_by LEFT JOIN suppliers s ON s.id=r.supplier_id WHERE r.id=${id}`,
    ),
    rows<RecordRow>(
      sql`SELECT l.id,l.material_id,l.quantity,l.notes,${canViewPrices(a) ? sql`l.price` : sql`null`} price,l.overage_approved_by,m.name material_name,m.quantity material_limit,b.code,b.name boq_name,b.description,un.name unit_name,COALESCE(rec.accepted,0)::text accepted,COALESCE(rec.returned,0)::text returned,COALESCE(rec.damaged,0)::text damaged,COALESCE(rec.rejected,0)::text rejected,(l.quantity+COALESCE((SELECT SUM(x.quantity) FROM request_lines x JOIN purchase_requests pr ON pr.id=x.request_id WHERE x.material_id=l.material_id AND x.request_id<>l.request_id AND (pr.status BETWEEN 1 AND 6 OR pr.status IN(9,10,11))),0 )>m.quantity) AS over FROM request_lines l JOIN materials m ON m.id=l.material_id JOIN boq_items b ON b.id=m.boq_item_id JOIN units un ON un.id=b.unit_id LEFT JOIN LATERAL(SELECT SUM(accepted) accepted,SUM(returned) returned,SUM(damaged) damaged,SUM(rejected) rejected FROM receipt_lines WHERE request_line_id=l.id)rec ON true WHERE l.request_id=${id} ORDER BY b.code,m.name LIMIT 100`,
    ),
    rows<RecordRow>(
      sql`SELECT t.id,t.from_status,t.to_status,t.created_at,t.note,u.name user_name FROM request_timeline t JOIN users u ON u.id=t.user_id WHERE t.request_id=${id} ${c ? sql`AND(t.created_at,t.id)<(${c.at}::timestamptz,${c.id}::uuid)` : sql``} ORDER BY t.created_at DESC,t.id DESC LIMIT 26`,
    ),
    rows<RecordRow>(
      sql`SELECT id,name,bytes,format,created_at FROM attachments WHERE request_id=${id} AND (receipt_key IS NULL OR receipt_id IS NOT NULL) ORDER BY created_at DESC,id DESC LIMIT 25`,
    ),
    rows<RecordRow>(
      sql`SELECT r.id,r.created_at,r.notes,u.name received_by FROM receipts r JOIN users u ON u.id=r.created_by WHERE r.request_id=${id} ORDER BY r.created_at DESC,r.id DESC LIMIT 25`,
    ),
    canViewPrices(a)
      ? rows<Quote>(
          sql`SELECT q.id,q.supplier_id,s.name supplier_name,q.expected_at,q.prices,q.selected,q.approved_by FROM request_quotes q JOIN suppliers s ON s.id=q.supplier_id WHERE q.request_id=${id} AND q.revision=${r.pricing_revision} ORDER BY q.created_at,q.id`,
        )
      : Promise.resolve([] as Quote[]),
  ]);
  return {
    ...r,
    quotes,
    ...detail,
    lines,
    history: page(history, true),
    files,
    receipts,
  };
}
export async function listResource(a: Actor, resource: string, q: Query) {
  const c = decodeCursor(q.cursor),
    after = (col = sql`id`) => (c ? sql`AND ${col}>${c.id}::uuid` : sql``);
  if (resource === "projects")
    return projectOptions(a, q.q, q.cursor, !!q.selectable);
  if (resource === "boq") {
    requirePermission(a, "boq.view");
    return page(
      await rows<RecordRow>(
        sql`SELECT b.id,b.project_id,b.parent_id,b.level,b.code,b.name,b.active,b.description,b.created_at,CASE WHEN b.level=3 THEN b.unit_id END unit_id,CASE WHEN b.level=3 THEN b.quantity END quantity,u.name unit_name,p.name project_name,pa.code parent_code FROM boq_items b JOIN projects p ON p.id=b.project_id LEFT JOIN units u ON b.level=3 AND u.id=b.unit_id LEFT JOIN boq_items pa ON pa.id=b.parent_id WHERE ${projectScope(a, sql`b.project_id`)} ${q.selectable ? sql`AND b.active=true AND (b.level<3 OR u.active=true) AND COALESCE(pa.active,true)=true AND NOT EXISTS(SELECT 1 FROM boq_items grand WHERE grand.id=pa.parent_id AND grand.active=false)` : sql``} ${q.level ? sql`AND b.level=${q.level}` : sql``} ${q.project ? sql`AND b.project_id=${q.project}` : sql``} AND (${q.q}='' OR b.name ILIKE ${"%" + q.q + "%"} OR b.code ILIKE ${"%" + q.q + "%"}) ${after(sql`b.id`)} ORDER BY b.id LIMIT 26`,
      ),
    );
  }
  if (resource === "materials") {
    requirePermission(a, "boq.view");
    return page(
      await rows<RecordRow>(
        sql`SELECT m.*,b.project_id,b.code,b.name boq_name,u.name unit_name FROM materials m JOIN boq_items b ON b.id=m.boq_item_id JOIN units u ON u.id=b.unit_id LEFT JOIN boq_items pa ON pa.id=b.parent_id WHERE ${projectScope(a, sql`b.project_id`)} ${q.selectable ? sql`AND m.active=true AND b.active=true AND u.active=true AND COALESCE(pa.active,true)=true AND NOT EXISTS(SELECT 1 FROM boq_items grand WHERE grand.id=pa.parent_id AND grand.active=false)` : sql``} ${q.project ? sql`AND b.project_id=${q.project}` : sql``} AND (${q.q}='' OR m.name ILIKE ${"%" + q.q + "%"} OR b.code ILIKE ${"%" + q.q + "%"}) ${after(sql`m.id`)} ORDER BY m.id LIMIT 26`,
      ),
    );
  }
  if (resource === "suppliers") {
    requirePermission(a, "suppliers.view");
    return page(
      await rows<RecordRow>(
        sql`SELECT id,name,active FROM suppliers WHERE ${q.selectable ? sql`active=true AND` : sql``} (${q.q}='' OR name ILIKE ${"%" + q.q + "%"}) ${after()} ORDER BY id LIMIT 26`,
      ),
    );
  }
  if (resource === "units") {
    requirePermission(a, "boq.view");
    return page(
      await rows<RecordRow>(
        sql`SELECT * FROM units WHERE ${q.selectable ? sql`active=true AND` : sql``} (${q.q}='' OR name ILIKE ${"%" + q.q + "%"}) ${after()} ORDER BY id LIMIT 26`,
      ),
    );
  }
  if (resource === "users") {
    requirePermission(a, "users.view");
    return page(
      await rows<RecordRow>(
        sql`SELECT u.id,u.name,u.email,u.username,u.job_title,u.role_id,u.locked,u.otp_enabled,u.otp_exempt,u.force_password_change,u.is_owner,r.active role_active,r.name role_name,COALESCE((SELECT json_agg(project_id) FROM project_users WHERE user_id=u.id),'[]'::json) project_ids,COALESCE((SELECT json_agg(json_build_object('id',p.id,'name',p.name,'code',p.code)) FROM project_users pu JOIN projects p ON p.id=pu.project_id WHERE pu.user_id=u.id),'[]'::json) projects FROM users u JOIN roles r ON r.id=u.role_id WHERE u.deleted_at IS NULL ${q.selectable ? sql`AND u.locked=false AND r.active=true` : sql``} AND (${q.q}='' OR u.name ILIKE ${"%" + q.q + "%"} OR u.email ILIKE ${"%" + q.q + "%"}) ${after(sql`u.id`)} ORDER BY u.id LIMIT 26`,
      ),
    );
  }
  if (resource === "roles") {
    requirePermission(a, "roles.view");
    return page(
      await rows<RecordRow>(
        sql`SELECT r.id,r.name,r.system,r.active,EXISTS(SELECT 1 FROM users own WHERE own.is_owner=true AND own.role_id=r.id) owner_role,COALESCE((SELECT json_agg(p.key) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=r.id),'[]'::json) permissions FROM roles r WHERE ${q.selectable ? sql`r.active=true AND` : sql``} (${q.q}='' OR r.name ILIKE ${"%" + q.q + "%"}) ${after(sql`r.id`)} ORDER BY r.id LIMIT 26`,
      ),
    );
  }
  throw new AppError("notFound", 404);
}
export async function notifications(a: Actor, cursor?: string, q = "") {
  const c = decodeCursor(cursor);
  return page(
    await rows<RecordRow>(
      sql`SELECT n.id,n.type,n.read_at,n.created_at,n.request_id,r.number FROM notifications n JOIN purchase_requests r ON r.id=n.request_id WHERE n.user_id=${a.id} AND ${requestScope(a)} AND (${q}='' OR r.number::text ILIKE ${"%" + q + "%"} OR CASE n.type WHEN 0 THEN ${ar.notificationTypes[0]} WHEN 1 THEN ${ar.notificationTypes[1]} ELSE ${ar.notificationTypes[2]} END ILIKE ${"%" + q + "%"}) ${c ? sql`AND(n.created_at,n.id)<(${c.at}::timestamptz,${c.id}::uuid)` : sql``} ORDER BY n.created_at DESC,n.id DESC LIMIT 26`,
    ),
    true,
  );
}
export async function auditList(a: Actor, q: Query) {
  requirePermission(a, "audit.view");
  const c = decodeCursor(q.cursor);
  return page(
    await rows<RecordRow>(
      sql`WITH events AS (SELECT id,actor_id,project_id,action,entity,entity_id,ip,user_agent,diff,created_at FROM audit_log UNION ALL SELECT (payload->>'id')::uuid,(payload->>'actor_id')::uuid,(payload->>'project_id')::uuid,(payload->>'action')::smallint,(payload->>'entity')::smallint,payload->>'entity_id',payload->>'ip',payload->>'user_agent',payload->'diff',(payload->>'created_at')::timestamptz FROM outbox WHERE kind=0) SELECT e.*,u.name user_name,p.name project_name FROM events e LEFT JOIN users u ON u.id=e.actor_id LEFT JOIN projects p ON p.id=e.project_id WHERE (${q.q}='' OR u.name ILIKE ${"%" + q.q + "%"} OR p.name ILIKE ${"%" + q.q + "%"} OR e.entity_id ILIKE ${"%" + q.q + "%"} OR e.diff::text ILIKE ${"%" + q.q + "%"}) ${q.project ? sql`AND e.project_id=${q.project}` : sql``} ${q.user ? sql`AND e.actor_id=${q.user}` : sql``} ${q.action !== undefined ? sql`AND e.action=${q.action}` : sql``} ${q.entity !== undefined ? sql`AND e.entity=${q.entity}` : sql``} ${q.from ? sql`AND e.created_at>=${q.from}::date` : sql``} ${q.to ? sql`AND e.created_at<${q.to}::date+interval '1 day'` : sql``} ${c ? sql`AND(e.created_at,e.id)<(${c.at}::timestamptz,${c.id}::uuid)` : sql``} ORDER BY e.created_at DESC,e.id DESC LIMIT 26`,
    ),
    true,
  );
}
