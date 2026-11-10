import { sql, one, type Executor, db } from "@/db";
import { type Actor, can } from "@/lib/domain";
import { AppError } from "./errors";
export function requirePermission(actor: Actor, key: string) {
  if (!can(actor, key)) throw new AppError("forbidden", 403);
}
type ScopeActor = Pick<Actor, "id" | "is_owner" | "permissions">;
export function projectScope(actor: ScopeActor, column = sql`p.id`) {
  return can(actor, "projects.all")
    ? sql`true`
    : sql`EXISTS (SELECT 1 FROM project_users pu WHERE pu.project_id=${column} AND pu.user_id=${actor.id}::uuid)`;
}
const departmentVisibility = [
  {
    permission: "project_management.view",
    start: 15,
    statuses: [2, 3, 4, 5, 6, 9, 10, 11, 15],
  },
  {
    permission: "procurement.view",
    start: 2,
    statuses: [2, 3, 4, 5, 6, 10, 11],
  },
  { permission: "finance.view", start: 10, statuses: [3, 4, 5, 6, 10, 11] },
  { permission: "accounts.view", start: 11, statuses: [3, 4, 5, 6, 11] },
  { permission: "receipts.view", start: 3, statuses: [3, 4, 5, 6] },
];
export function departmentScope(actor: ScopeActor) {
  if (
    actor.is_owner ||
    !can(actor, "requests.view_all") ||
    can(actor, "construction.view") ||
    can(actor, "technical.view")
  )
    return;
  return departmentVisibility.find((stage) => can(actor, stage.permission));
}
export function requestScope(actor: ScopeActor) {
  const department = departmentScope(actor);
  const stage = department
    ? sql`(r.created_by=${actor.id} OR r.status IN (${sql.join(
        department.statuses.map((s) => sql`${s}`),
        sql`,`,
      )}) OR EXISTS(SELECT 1 FROM request_timeline st WHERE st.request_id=r.id AND (st.from_status=${department.start} OR st.to_status=${department.start})))`
    : sql`true`;
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
