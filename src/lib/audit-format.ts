import { ar } from "@/messages/ar";
export function translateDiff(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(translateDiff);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        ar.auditFields[key as keyof typeof ar.auditFields] || key,
        translateDiff(v),
      ]),
    );
  if (typeof value === "boolean") return value ? ar.common.yes : ar.common.no;
  if (typeof value === "string" && /^[a-z_]+\.[a-z_]+$/.test(value)) {
    const [module, action] = value.split(".");
    const label = ar.nav[module as keyof typeof ar.nav];
    const actionLabel =
      ar.permissionActions[action as keyof typeof ar.permissionActions];
    if (label && actionLabel) return `${label} · ${actionLabel}`;
  }
  return value;
}
