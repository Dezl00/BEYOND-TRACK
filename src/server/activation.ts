import { canManageUnits } from "@/lib/domain";
import { z } from "zod";
import { db, one, rows, sql } from "@/db";
import type { Actor } from "@/lib/domain";
import { uuid } from "@/lib/validation";
import { requirePermission, requireProject } from "./access";
import { AppError } from "./errors";
import { audit, type Meta } from "./events";

export const activationSchema = z.object({
  resource: z.enum([
    "user",
    "role",
    "boq",
    "material",
    "unit",
    "supplier",
    "project",
  ]),
  id: uuid,
  active: z.boolean(),
});
export async function setActive(
  actor: Actor,
  input: z.infer<typeof activationSchema>,
  meta: Meta,
) {
  const config = {
    user: {
      table: "users",
      module: "users",
      entity: 0,
      column: "locked",
      invert: true,
    },
    role: { table: "roles", module: "roles", entity: 7, column: "active" },
    boq: { table: "boq_items", module: "boq", entity: 2, column: "active" },
    material: {
      table: "materials",
      module: "boq",
      entity: 3,
      column: "active",
    },
    unit: { table: "units", module: "boq", entity: 11, column: "active" },
    supplier: {
      table: "suppliers",
      module: "suppliers",
      entity: 6,
      column: "active",
    },
    project: {
      table: "projects",
      module: "projects",
      entity: 1,
      column: "archived",
      invert: true,
    },
  }[input.resource];
  if (input.resource === "unit" && !canManageUnits(actor))
    throw new AppError("forbidden", 403);
  requirePermission(actor, `${config.module}.edit`);
  return db().transaction(async (tx) => {
    const row = await one<Record<string, unknown>>(
      sql`SELECT * FROM ${sql.identifier(config.table)} WHERE id=${input.id} FOR UPDATE`,
      tx,
    );
    if (!row || row.deleted_at) throw new AppError("notFound", 404);
    if (input.resource === "user" && row.is_owner)
      throw new AppError("owner", 403);
    let projectId: string | null =
      typeof row.project_id === "string"
        ? row.project_id
        : input.resource === "project"
          ? input.id
          : null;
    if (input.resource === "material")
      projectId =
        (
          await one<{ project_id: string }>(
            sql`SELECT project_id FROM boq_items WHERE id=${String(row.boq_item_id)}`,
            tx,
          )
        )?.project_id || null;
    if (projectId)
      await requireProject(actor, projectId, tx, input.resource !== "project");
    if (
      input.resource === "role" &&
      !input.active &&
      (await one(
        sql`SELECT id FROM users WHERE is_owner=true AND role_id=${input.id}`,
        tx,
      ))
    )
      throw new AppError("owner", 403);
    if (
      input.active &&
      !actor.is_owner &&
      (input.resource === "role" || input.resource === "user")
    ) {
      const roleId = input.resource === "role" ? input.id : String(row.role_id);
      const permissions = await rows<{ key: string }>(
        sql`SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=${roleId}`,
        tx,
      );
      if (permissions.some((p) => !actor.permissions.includes(p.key)))
        throw new AppError("forbidden", 403);
    }
    const stored =
      "invert" in config && config.invert ? !input.active : input.active;
    await tx.execute(
      sql`UPDATE ${sql.identifier(config.table)} SET ${sql.identifier(config.column)}=${stored} WHERE id=${input.id}`,
    );
    if (
      !input.active &&
      (input.resource === "user" || input.resource === "role")
    ) {
      const users =
        input.resource === "user"
          ? sql`user_id=${input.id}`
          : sql`user_id IN(SELECT id FROM users WHERE role_id=${input.id})`;
      await tx.execute(sql`DELETE FROM sessions WHERE ${users}`);
      await tx.execute(sql`DELETE FROM auth_challenges WHERE ${users}`);
      await tx.execute(sql`DELETE FROM push_subscriptions WHERE ${users}`);
    }
    await audit(
      tx,
      actor.id,
      meta,
      1,
      config.entity,
      input.id,
      { [config.column]: { before: row[config.column], after: stored } },
      projectId,
    );
    return { active: input.active };
  });
}
