import { db, rows, sql, type Executor } from "@/db";
import { approvalPermission, Status } from "@/lib/domain";

// A request may revisit the same status. Identify this handoff by its timeline row.
export const currentHandoff = sql`COALESCE((SELECT t.id FROM request_timeline t
  WHERE t.request_id=r.id AND t.from_status IS DISTINCT FROM t.to_status
  ORDER BY t.created_at DESC,t.id DESC LIMIT 1),r.id)`;

export async function workflowRecipients(
  requestId: string,
  status: unknown,
  handoff: unknown,
  conn: Executor = db(),
  userId?: string,
) {
  if (typeof status !== "number" || typeof handoff !== "string") return [];
  const creatorStep = [
    Status.returned,
    Status.rejected,
    Status.cancelled,
    Status.closed,
  ].some((s) => s === status);
  const receiving = status === Status.ordered || status === Status.partial;
  const approval = [
    Status.construction,
    Status.held,
    Status.submitted,
    Status.projectApproval,
    Status.procurement,
    Status.pricingFinance,
    Status.pricingApproved,
    Status.received,
    Status.awaitingInvoice,
  ].some((s) => s === status);
  if (!creatorStep && !receiving && !approval) return [];
  const permission = receiving ? "receipts.create" : approvalPermission(status);
  const roleHas = (
    key: string,
  ) => sql`EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=u.role_id AND p.key=${key})`;
  const audience = creatorStep
    ? sql`u.id=r.created_by`
    : sql`
    NOT u.is_owner AND NOT (role.system AND ${roleHas("security.manage")})
    AND (role.workflow_role IS NULL OR role.workflow_role=${permission.split(".")[0]})
    AND ${roleHas(permission)}
    ${status === Status.procurement ? sql`AND ${roleHas("procurement.edit")}` : sql``}`;
  const recipients = await rows<{ id: string }>(
    sql`SELECT u.id FROM purchase_requests r
    JOIN project_users pu ON pu.project_id=r.project_id JOIN users u ON u.id=pu.user_id
    JOIN roles role ON role.id=u.role_id AND role.active
    WHERE r.id=${requestId} AND r.status=${status} AND ${currentHandoff}=${handoff}::uuid
      AND NOT u.locked AND u.deleted_at IS NULL AND ${audience}
      AND (u.is_owner OR (${roleHas("requests.view")} AND (u.id=r.created_by OR ${roleHas("requests.view_all")})))
      ${userId ? sql`AND u.id=${userId}` : sql``}`,
    conn,
  );
  return recipients.map((user) => user.id);
}
