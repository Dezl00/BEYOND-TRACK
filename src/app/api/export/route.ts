import { fromRequest } from "@/messages/request";
import { catalogExport } from "@/server/catalog-export";
import { catalogHeaders } from "@/lib/catalog-transfer";
import { canManageUnits } from "@/lib/domain";
import { decimalText } from "@/lib/format";
import { z } from "zod";
import { requireActor } from "@/server/auth";
import { requirePermission } from "@/server/access";
import { listResource, listRequests, auditList } from "@/server/queries";
import { listQuerySchema } from "@/lib/validation";
import { ar } from "@/messages/ar";
import { AppError, errorResponse } from "@/server/errors";
export const maxDuration = 60;
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
    const { m: ar, unit, role } = fromRequest(req);
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
    if (["boq", "materials", "units"].includes(resource)) {
      const data = await catalogExport(a, q.project);
      const content = [
        catalogHeaders(fromRequest(req).locale),
        ...data.map((r) => [
          r.main,
          r.second,
          r.leaf,
          r.material,
          unit(r.unit),
          r.quantity,
          r.project,
          r.description,
        ]),
      ]
        .map((r) => r.map(csv).join(","))
        .join("\r\n");
      return new Response("\uFEFF" + content, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="beyond-boq.csv"',
          "Cache-Control": "private, no-store",
        },
      });
    }
    // A material export always starts at the beginning of the filtered catalog.
    if (resource === "materials") q.cursor = undefined;
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
          : await listResource(a, resource, q, 200);
    const columns: Record<string, string> = {
      id: ar.fields.entityId,
      name: ar.fields.name,
      code: ar.fields.code,
      description: ar.fields.description,
      unit_name: ar.fields.unit,
      quantity: ar.fields.quantity,
      client: ar.interface.client,
      details: ar.interface.projectDetails,
      start_date: ar.interface.startDate,
      end_date: ar.interface.endDate,
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
    const encodeRows = (items: typeof result.items) =>
      items
        .map((row) =>
          keys
            .map((k) =>
              csv(
                k === "quantity"
                  ? decimalText(row[k])
                  : (k === "name" && resource === "units") ||
                      (k === "symbol" && resource === "units")
                    ? unit(row[k], k === "symbol")
                    : k === "role_name" ||
                        (k === "name" && resource === "roles")
                      ? role(row[k])
                      : k === "unit_name"
                        ? unit(row[k])
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
        )
        .join("\r\n");
    const header = "\uFEFF" + keys.map((k) => csv(columns[k])).join(",");
    let content: string | ReadableStream<Uint8Array>;
    if (resource === "materials") {
      const encoder = new TextEncoder();
      let current: typeof result | null = result;
      let first = true;
      content = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            if (req.signal.aborted) {
              controller.close();
              return;
            }
            if (!current) current = await listResource(a, resource, q, 200);
            controller.enqueue(
              encoder.encode(
                (first ? header : "") +
                  (current.items.length
                    ? "\r\n" + encodeRows(current.items)
                    : ""),
              ),
            );
            first = false;
            if (!current.next) controller.close();
            else {
              q.cursor = current.next;
              current = null;
            }
          } catch (error) {
            controller.error(error);
          }
        },
      });
    } else {
      content =
        header + (result.items.length ? "\r\n" + encodeRows(result.items) : "");
    }
    return new Response(content, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="beyond-${resource}.csv"`,
        "Cache-Control": "private, no-store",
        ...(resource !== "materials" && result.next
          ? { "X-Next-Cursor": result.next }
          : {}),
      },
    });
  } catch (e) {
    return errorResponse(e, req);
  }
}
