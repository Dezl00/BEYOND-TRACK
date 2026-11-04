import Decimal from "decimal.js";
export const Status = {
  draft: 0,
  submitted: 1,
  procurement: 2,
  ordered: 3,
  partial: 4,
  received: 5,
  closed: 6,
  rejected: 7,
  cancelled: 8,
  finance: 9,
} as const;
export type RequestStatus = (typeof Status)[keyof typeof Status];
export const transitions: Record<number, number[]> = {
  0: [1, 8],
  1: [9, 7, 8],
  9: [2, 7, 8],
  2: [3, 7, 8],
  3: [8],
  4: [],
  5: [6],
  6: [],
  7: [0],
  8: [],
};
export function editable(
  submittedAt: Date | string | null,
  status: number,
  now = Date.now(),
) {
  return (
    status === 0 ||
    (status >= 1 &&
      (status <= 5 || status === 9) &&
      !!submittedAt &&
      now - new Date(submittedAt).getTime() <= 15 * 60_000)
  );
}
export function effectivePreference(
  policy: { in_app: boolean; email: boolean; forced: boolean },
  pref?: { in_app: boolean; email: boolean },
) {
  return policy.forced || !pref ? policy : pref;
}
export function receiptStatus(
  lines: { quantity: string; accepted: string; returned: string }[],
) {
  const all = lines.every((l) =>
    new Decimal(l.accepted).minus(l.returned).gte(l.quantity),
  );
  const some = lines.some((l) =>
    new Decimal(l.accepted).minus(l.returned).gt(0),
  );
  return all ? Status.received : some ? Status.partial : Status.ordered;
}
export function isOverage(limit: string, committed: string, requested: string) {
  return new Decimal(committed).plus(requested).gt(limit);
}
export const modules = [
  "projects",
  "boq",
  "requests",
  "procurement",
  "technical",
  "finance",
  "receipts",
  "reports",
  "suppliers",
  "users",
  "roles",
  "settings",
  "audit",
] as const;
export const actions = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
] as const;
export function actionsForModule(module: (typeof modules)[number]) {
  return module === "reports" ? (["view", "export"] as const) : actions;
}
export const specialPermissions = [
  "projects.all",
  "requests.view_all",
  "security.manage",
] as const;
export type Actor = {
  id: string;
  name: string;
  email: string;
  username: string;
  job_title: string;
  role_id: string;
  role_name: string;
  is_owner: boolean;
  force_password_change: boolean;
  theme: number;
  otp_enabled: boolean;
  otp_exempt: boolean;
  permissions: string[];
  session_id: string;
  expires_at: Date;
  remember: boolean;
};
export const can = (
  actor: Pick<Actor, "is_owner" | "permissions">,
  permission: string,
) =>
  permission.startsWith("audit.")
    ? actor.is_owner
    : actor.is_owner || actor.permissions.includes(permission);
