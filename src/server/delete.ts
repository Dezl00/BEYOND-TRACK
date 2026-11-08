import { z } from "zod";
import { db, sql, one } from "@/db";
import type { Actor } from "@/lib/domain";
import { uuid } from "@/lib/validation";
import { requirePermission, requireProject } from "./access";
import { AppError } from "./errors";
import { audit, type Meta } from "./events";
export const deleteSchema = z.object({
  resource: z.enum(["user", "boq", "material", "unit", "supplier", "role"]),
  id: uuid,
});
export async function deleteRecord(
  a: Actor,
  v: z.infer<typeof deleteSchema>,
  meta: Meta,
) {
  const map = {
    user: { table: "users", module: "users", entity: 0 },
    boq: { table: "boq_items", module: "boq", entity: 2 },
    material: { table: "materials", module: "boq", entity: 3 },
    unit: { table: "units", module: "boq", entity: 11 },
    supplier: { table: "suppliers", module: "suppliers", entity: 6 },
    role: { table: "roles", module: "roles", entity: 7 },
  };
  const config = map[v.resource];
  requirePermission(a, `${config.module}.delete`);
  return db().transaction(async (tx) => {
    const row = await one<{
      id: string;
      name: string;
      project_id?: string;
      boq_item_id?: string;
      is_owner?: boolean;
      deleted_at?: Date | null;
    }>(
      sql`SELECT * FROM ${sql.identifier(config.table)} WHERE id=${v.id} FOR UPDATE`,
      tx,
    );
    if (!row || row.deleted_at) throw new AppError("notFound", 404);
    if (row.is_owner) throw new AppError("owner", 403);
    let projectId = row.project_id;
    if (row.boq_item_id)
      projectId = (
        await one<{ project_id: string }>(
          sql`SELECT project_id FROM boq_items WHERE id=${row.boq_item_id}`,
          tx,
        )
      )?.project_id;
    if (projectId) await requireProject(a, projectId, tx, true);
    if (v.resource === "user") {
      // Preserve historical actors referenced by immutable requests/receipts.
      // Tombstoning also frees the unique login identifiers for replacement accounts.
      await tx.execute(
        sql`UPDATE users SET deleted_at=now(),locked=true,whatsapp_enabled=false,whatsapp_number=null,email=${`deleted-${v.id}@internal.invalid`},username=${`deleted-${v.id}`} WHERE id=${v.id}`,
      );
      await tx.execute(
        sql`DELETE FROM outbox WHERE kind=5 AND payload->>'userId'=${v.id}`,
      );
      for (const table of [
        "sessions",
        "auth_challenges",
        "push_subscriptions",
        "notification_preferences",
        "notifications",
        "project_users",
      ])
        await tx.execute(
          sql`DELETE FROM ${sql.identifier(table)} WHERE user_id=${v.id}`,
        );
    } else
      await tx.execute(
        sql`DELETE FROM ${sql.identifier(config.table)} WHERE id=${v.id}`,
      );
    await audit(
      tx,
      a.id,
      meta,
      2,
      config.entity,
      v.id,
      { name: { before: row.name, after: null } },
      projectId || null,
    );
    return {};
  });
}
