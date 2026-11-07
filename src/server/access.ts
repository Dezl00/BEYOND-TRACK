import { sql, one, type Executor, db } from "@/db";
import { type Actor, can } from "@/lib/domain";
import { AppError } from "./errors";
export function requirePermission(actor: Actor, key: string) {
  if (!can(actor, key)) throw new AppError("forbidden", 403);
}
export function projectScope(actor: Actor, column = sql`p.id`) {
  return can(actor, "projects.all")
    ? sql`true`
    : sql`EXISTS (SELECT 1 FROM project_users pu WHERE pu.project_id=${column} AND pu.user_id=${actor.id}::uuid)`;
}
export function requestScope(actor: Actor) {
  let stage = sql`true`;
  if (
    !actor.is_owner &&
    can(actor, "requests.view_all") &&
    !can(actor, "technical.view")
  ) {
    if (can(actor, "finance.view"))
      stage = sql`(r.status IN(2,3,4,5,6,9,10,11) OR EXISTS(SELECT 1 FROM request_timeline st WHERE st.request_id=r.id AND st.from_status=9))`;
    else if (can(actor, "procurement.view"))
      stage = sql`(r.status IN(2,3,4,5,6,10,11) OR EXISTS(SELECT 1 FROM request_timeline st WHERE st.request_id=r.id AND st.from_status=2))`;
  }
  return sql`${projectScope(actor, sql`r.project_id`)} AND ${can(actor, "requests.view_all") ? sql`true` : sql`r.created_by=${actor.id}::uuid`} AND ${actor.is_owner ? sql`true` : sql`(r.status<>0 OR r.created_by=${actor.id}::uuid)`} AND ${stage}`;
}
export async function requireProject(
  actor: Actor,
  id: string,
  conn: Executor = db(),
  write = false,
) {
  const p = await one<{ id: string; archived: boolean }>(
    sql`SELECT p.id,p.archived FROM projects p WHERE p.id=${id}::uuid AND ${projectScope(actor)}`,
    conn,
  );
  if (!p) throw new AppError("project", 403);
  if (write && p.archived) throw new AppError("archive", 409);
  return p;
}
export type RequestRow = {
  id: string;
  number: number;
  project_id: string;
  created_by: string;
  status: number;
  notes: string;
  supplier_id: string | null;
  expected_at: string | null;
  submitted_at: Date | null;
  version: number;
  pricing_revision: number;
  created_at: Date;
};
export async function requireRequest(
  actor: Actor,
  id: string,
  conn: Executor = db(),
  lock = false,
) {
  requirePermission(actor, "requests.view");
  const r = await one<RequestRow>(
    sql`SELECT r.* FROM purchase_requests r WHERE r.id=${id}::uuid AND ${requestScope(actor)} ${lock ? sql`FOR UPDATE OF r` : sql``}`,
    conn,
  );
  if (!r) throw new AppError("notFound", 404);
  return r;
}
