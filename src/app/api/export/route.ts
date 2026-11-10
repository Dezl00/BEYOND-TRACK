import { canManageUnits } from "@/lib/domain";
import { decimalText } from "@/lib/format";
import { z } from "zod";
import { requireActor } from "@/server/auth";
import { requirePermission } from "@/server/access";
import { listResource, listRequests, auditList } from "@/server/queries";
import { listQuerySchema } from "@/lib/validation";
import { ar } from "@/messages/ar";
import { AppError, errorResponse } from "@/server/errors";
function csv(value: unknown) {
  let text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function GET(req: Request) {
  try {
    const a = await requireActor(),
      params = new URL(req.url).searchParams,
      resource = z
        .enum([
          "requests",
          "procurement",
          "technical",
          "construction",
          "project_management",
          "accounts",
          "finance",
          "receipts",
          "projects",
          "boq",
          "materials",
          "units",
          "suppliers",
          "users",
          "roles",
          "audit",
        ])
        .parse(params.get("resource")),
      q = listQuerySchema.parse(
        Object.fromEntries([...params].filter(([k]) => k !== "resource")),
      );
    requirePermission(
      a,
      `${["materials", "units"].includes(resource) ? "boq" : resource}.export`,
    );
    if (resource === "units" && !canManageUnits(a))
      throw new AppError("forbidden", 403);
    const result =
      resource === "audit"
        ? await auditList(a, q)
        : [
              "requests",
              "technical",
              "construction",
              "project_management",
              "accounts",
              "finance",
              "procurement",
              "receipts",
            ].includes(resource)
          ? await listRequests(a, q, resource)
          : await listResource(a, resource, q);
    const columns: Record<string, string> = {
      id: ar.fields.entityId,
      name: ar.fields.name,
      code: ar.fields.code,
      description: ar.fields.description,
      unit_name: ar.fields.unit,
      quantity: ar.fields.quantity,
      client: "العميل",
      details: "تفاصيل المشروع",
      start_date: "تاريخ البدء",
      end_date: "تاريخ الانتهاء",
      project_name: ar.common.project,
      number: ar.fields.requestNumber,
      status: ar.fields.status,
      active: ar.common.active,
      locked: ar.auth.locked,
      created_at: ar.fields.createdAt,
      expected_at: ar.fields.expectedAt,
      created_by_name: ar.fields.createdBy,
      supplier_name: ar.fields.supplier,
      email: ar.fields.email,
      role_name: ar.fields.role,
      job_title: ar.auth.jobTitle,
      symbol: ar.fields.symbol,
      action: ar.fields.action,
      entity: ar.fields.entity,
      entity_id: ar.fields.entityId,
      user_name: ar.fields.user,
      ip: ar.auth.ip,
      diff: ar.fields.diff,
    };
    const keys = Object.keys(columns).filter((k) =>
      result.items.some((r) => k in r),
    );
    const content =
      "\uFEFF" +
      [
        keys.map((k) => csv(columns[k])).join(","),
        ...result.items.map((row) =>
          keys
            .map((k) =>
              csv(
                k === "quantity"
                  ? decimalText(row[k])
                  : k === "unit_name"
                    ? (row[k] ?? "")
                    : k === "status"
                      ? ar.statuses[Number(row[k])]
                      : k === "action"
                        ? ar.auditActions[Number(row[k])]
                        : k === "entity"
                          ? ar.auditEntities[Number(row[k])]
                          : typeof row[k] === "boolean"
                            ? row[k]
                              ? ar.common.yes
                              : ar.common.no
                            : row[k],
              ),
            )
            .join(","),
        ),
      ].join("\r\n");
    return new Response(content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="beyond-${resource}.csv"`,
        "Cache-Control": "private, no-store",
        ...(result.next ? { "X-Next-Cursor": result.next } : {}),
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
