import type { MessageCatalog } from "@/messages/types";
import { ar } from "@/messages/ar";
export function translateDiff(value: unknown, msg:MessageCatalog=ar): unknown {
  if (Array.isArray(value)) return value.map(v=>translateDiff(v,msg));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [
        msg.auditFields[key as keyof typeof msg.auditFields] || key,
        translateDiff(v,msg),
      ]),
    );
  if (typeof value === "boolean") return value ? msg.common.yes : msg.common.no;
  if (typeof value === "string" && /^[a-z_]+\.[a-z_]+$/.test(value)) {
    const [module, action] = value.split(".");
    const label = msg.nav[module as keyof typeof msg.nav];
    const actionLabel =
      msg.permissionActions[action as keyof typeof msg.permissionActions];
    if (label && actionLabel) return `${label} · ${actionLabel}`;
  }
  return value;
}
