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
  pricingFinance: 10,
  pricingApproved: 11,
  construction: 12,
  held: 13,
  returned: 14,
  projectApproval: 15,
} as const;
export type RequestStatus = (typeof Status)[keyof typeof Status];
export const transitions: Record<number, number[]> = {
  0: [12, 8],
  12: [1, 13, 7, 8],
  13: [1, 7, 8],
  1: [15, 14, 8],
  14: [12, 8],
  15: [2, 7, 8],
  9: [],
  2: [10, 8],
  10: [2, 11, 8],
  11: [3, 8],
  3: [8],
  4: [],
  5: [6],
  6: [],
  7: [0],
  8: [],
};
export const requestModules = [
  "construction",
  "technical",
  "project_management",
  "procurement",
  "finance",
  "accounts",
  "receipts",
] as const;
export const stageStatuses: Record<string, number[]> = {
  construction: [12, 13, 14],
  technical: [1],
  project_management: [15],
  procurement: [2, 3, 4, 5, 10, 11],
  finance: [10],
  accounts: [11],
  receipts: [3, 4, 5, 6],
};
export function approvalPermission(status: number) {
  if ([12, 13].includes(status)) return "construction.approve";
  if (status === 1) return "technical.approve";
  if (status === 15) return "project_management.approve";
  if (status === 10) return "finance.approve";
  if (status === 11) return "accounts.approve";
  return "procurement.approve";
}
export function editable(
  submittedAt: Date | string | null,
  status: number,
  now = Date.now(),
) {
  return (
    [0, 14].includes(status) ||
    (status >= 1 &&
      (status <= 5 || [9, 10, 11, 12, 13, 15].includes(status)) &&
      !!submittedAt &&
      now - new Date(submittedAt).getTime() <= 15 * 60_000)
  );
}
export function effectivePreference(
  policy: {
    in_app: boolean;
    email: boolean;
    whatsapp?: boolean;
    forced: boolean;
  },
  pref?: { in_app: boolean; email: boolean; whatsapp?: boolean },
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
  "construction",
  "project_management",
  "accounts",
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
  if (module === "reports") return ["view", "export"] as const;
  if (["construction", "project_management", "accounts"].includes(module))
    return ["view", "approve", "export"] as const;
  return actions;
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
  unit_supervisor?: boolean;
  workflow_role?: string | null;
  is_owner: boolean;
  force_password_change: boolean;
  theme: number;
  locale?: string | null;
  otp_enabled: boolean;
  otp_exempt: boolean;
  permissions: string[];
  session_id: string;
  expires_at: Date;
  remember: boolean;
};
export const canManageUnits = (actor: Actor) =>
  actor.is_owner || actor.unit_supervisor === true;
export const canViewPrices = (actor: Pick<Actor, "is_owner" | "permissions">) =>
  can(actor, "procurement.view") ||
  can(actor, "finance.view") ||
  can(actor, "accounts.view");
export const canApproveOverage = (
  actor: Pick<Actor, "is_owner" | "workflow_role">,
) => actor.is_owner || actor.workflow_role === "construction";

export const can = (
  actor: Pick<Actor, "is_owner" | "permissions">,
  permission: string,
) =>
  permission.startsWith("audit.")
    ? actor.is_owner
    : actor.is_owner || actor.permissions.includes(permission);
