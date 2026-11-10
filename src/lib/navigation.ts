import { can, type Actor } from "./domain";
export const navigationItems = [
  { key: "dashboard", permission: "requests.view" },
  { key: "projects", permission: "projects.view" },
  { key: "boq", permission: "boq.view" },
  { key: "requests", permission: "requests.view" },
  { key: "construction", permission: "construction.view" },
  { key: "technical", permission: "technical.view" },
  { key: "project_management", permission: "project_management.view" },
  { key: "procurement", permission: "procurement.view" },
  { key: "finance", permission: "finance.view" },
  { key: "accounts", permission: "accounts.view" },
  { key: "receipts", permission: "receipts.view" },
  { key: "reports", permission: "reports.view" },
  { key: "suppliers", permission: "suppliers.view" },
  { key: "users", permission: "users.view" },
  { key: "roles", permission: "roles.view" },
  { key: "audit", permission: "audit.view" },
  { key: "notifications", permission: "requests.view" },
  { key: "settings", permission: "" },
] as const;
export type NavigationKey = (typeof navigationItems)[number]["key"];
export function permittedNavigation(
  actor: Pick<Actor, "permissions" | "is_owner" | "force_password_change">,
) {
  return navigationItems.filter(
    (item) =>
      (!item.permission || can(actor, item.permission)) &&
      (!actor.force_password_change || item.key === "settings"),
  );
}
export function mobileNavigation(
  actor: Pick<Actor, "permissions" | "is_owner" | "force_password_change">,
) {
  const allowed = permittedNavigation(actor).map((item) => item.key);
  const priority = [
    "dashboard",
    "requests",
    "procurement",
    "receipts",
    "construction",
    "project_management",
    "accounts",
    "technical",
    "finance",
    "notifications",
  ] as const;
  return priority.filter((key) => allowed.includes(key)).slice(0, 4);
}
export function navigationKey(path: string) {
  const key = path.split("/")[1];
  return key === "materials" || key === "units" ? "boq" : key;
}
export function navigationHref(key: NavigationKey | "more", project: string) {
  const scoped = [
    "dashboard",
    "projects",
    "boq",
    "requests",
    "construction",
    "project_management",
    "accounts",
    "technical",
    "finance",
    "procurement",
    "receipts",
    "notifications",
    "more",
    "reports",
  ].includes(key);
  return `/${key}${project && scoped ? `?project=${encodeURIComponent(project)}` : ""}`;
}
