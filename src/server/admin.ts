import { canManageUnits } from "@/lib/domain";
import { randomUUID } from "node:crypto";
import { hash as hashPassword } from "bcryptjs";
import type { z } from "zod";
import { db, sql, one, rows } from "@/db";
import type { Actor } from "@/lib/domain";
import {
  projectSchema,
  boqSchema,
  materialSchema,
  supplierSchema,
  unitSchema,
  userSchema,
  roleSchema,
  settingsSchema,
  preferencesSchema,
} from "@/lib/validation";
import { requirePermission, requireProject } from "./access";
import { audit, changes, type Meta } from "./events";
import { AppError } from "./errors";
export async function saveProject(
  a: Actor,
  v: z.infer<typeof projectSchema>,
  m: Meta,
) {
  requirePermission(a, `projects.${v.id ? "edit" : "create"}`);
  return db().transaction(async (tx) => {
    const id = v.id || randomUUID();
    let old: Record<string, unknown> = {};
    if (v.id) {
      await requireProject(a, id, tx);
      old = (await one<Record<string, unknown>>(
        sql`SELECT code,name,location,archived,client,details,start_date::text,end_date::text FROM projects WHERE id=${id} FOR UPDATE`,
        tx,
      ))!;
      await tx.execute(
        sql`UPDATE projects SET code=COALESCE(NULLIF(${v.code ?? ""},''),code),name=${v.name},location=${v.location},client=${v.client ?? old.client ?? null},details=${v.details ?? old.details ?? null},start_date=NULLIF(${v.startDate ?? old.start_date ?? ""},'')::date,end_date=NULLIF(${v.endDate ?? old.end_date ?? ""},'')::date,archived=${v.archived} WHERE id=${id}`,
      );
    } else {
      await tx.execute(
        sql`INSERT INTO projects(id,code,name,location,client,details,start_date,end_date) VALUES (${id},COALESCE(NULLIF(${v.code ?? ""},''),next_project_code()),${v.name},${v.location},${v.client ?? null},${v.details ?? null},${v.startDate || null},${v.endDate || null})`,
      );
      await tx.execute(
        sql`INSERT INTO project_users(project_id,user_id) VALUES (${id},${a.id})`,
      );
    }
    await audit(
      tx,
      a.id,
      m,
      v.id ? 1 : 0,
      1,
      id,
      changes(old, {
        code: v.code || old.code,
        name: v.name,
        location: v.location,
        client: v.client ?? old.client,
        details: v.details ?? old.details,
        start_date: v.startDate ?? old.start_date,
        end_date: v.endDate ?? old.end_date,
        archived: v.archived,
      }),
      id,
    );
    return { id };
  });
}
export async function saveBoq(a: Actor, v: z.infer<typeof boqSchema>, m: Meta) {
  requirePermission(a, `boq.${v.id ? "edit" : "create"}`);
  return db().transaction(async (tx) => {
    await requireProject(a, v.projectId, tx, true);
    const id = v.id || randomUUID();
    const old = v.id
      ? await one<Record<string, unknown>>(
          sql`SELECT * FROM boq_items WHERE id=${id} AND project_id=${v.projectId} FOR UPDATE`,
          tx,
        )
      : {};
    if (!old) throw new AppError("notFound", 404);
    if (v.parentId) {
      const parent = await one<{ level: number }>(
        sql`SELECT level FROM boq_items WHERE id=${v.parentId} AND project_id=${v.projectId}`,
        tx,
      );
      if (!parent || parent.level !== v.level - 1)
        throw new AppError("hierarchy");
    } else if (v.level !== 1) throw new AppError("hierarchy");
    if (
      v.level === 3 &&
      v.unitId &&
      !(await one(
        sql`SELECT id FROM units WHERE id=${v.unitId} AND active=true`,
        tx,
      ))
    )
      throw new AppError("invalid");
    if (v.id)
      await tx.execute(
        sql`UPDATE boq_items SET parent_id=${v.parentId},level=${v.level},name=${v.name},description=${v.level === 3 ? v.description : null},unit_id=${v.unitId},quantity=${v.quantity},active=COALESCE(${v.active ?? null},active) WHERE id=${id}`,
      );
    else
      await tx.execute(
        sql`INSERT INTO boq_items(id,project_id,parent_id,level,name,description,unit_id,quantity,active) VALUES (${id},${v.projectId},${v.parentId},${v.level},${v.name},${v.level === 3 ? v.description : null},${v.unitId},${v.quantity},${v.active ?? true})`,
      );
    await audit(
      tx,
      a.id,
      m,
      v.id ? 1 : 0,
      2,
      id,
      changes(old, {
        parent_id: v.parentId,
        level: v.level,
        name: v.name,
        description: v.description,
        unit_id: v.unitId,
        quantity: v.quantity,
        ...(v.active !== undefined ? { active: v.active } : {}),
      }),
      v.projectId,
    );
    return { id };
  });
}
export async function saveMaterial(
  a: Actor,
  v: z.infer<typeof materialSchema>,
  m: Meta,
) {
  requirePermission(a, `boq.${v.id ? "edit" : "create"}`);
  return db().transaction(async (tx) => {
    const b = await one<{
      project_id: string;
      level: number;
      unit_id: string | null;
    }>(
      sql`SELECT project_id,level,unit_id FROM boq_items WHERE id=${v.boqItemId}`,
      tx,
    );
    if (!b || b.level !== 3) throw new AppError("hierarchy");
    await requireProject(a, b.project_id, tx, true);
    const id = v.id || randomUUID(),
      old = v.id
        ? await one<Record<string, unknown>>(
            sql`SELECT * FROM materials WHERE id=${id} AND boq_item_id=${v.boqItemId} FOR UPDATE`,
            tx,
          )
        : {};
    if (!old) throw new AppError("notFound", 404);
    const unitId = v.unitId || old.unit_id || b.unit_id;
    if (
      !(await one(
        sql`SELECT id FROM units WHERE id=${unitId} AND active=true`,
        tx,
      ))
    )
      throw new AppError("invalid");
    if (
      v.id &&
      unitId !== (old.unit_id || b.unit_id) &&
      (await one(
        sql`SELECT id FROM request_lines WHERE material_id=${id} LIMIT 1`,
        tx,
      ))
    )
      throw new AppError("referenced", 409);
    if (v.id)
      await tx.execute(
        sql`UPDATE materials SET unit_id=${unitId},name=${v.name},quantity=${v.quantity},active=${v.active} WHERE id=${id}`,
      );
    else
      await tx.execute(
        sql`INSERT INTO materials(id,boq_item_id,unit_id,name,quantity) VALUES (${id},${v.boqItemId},${unitId},${v.name},${v.quantity})`,
      );
    await audit(
      tx,
      a.id,
      m,
      v.id ? 1 : 0,
      3,
      id,
      changes(old, {
        unit_id: unitId,
        name: v.name,
        quantity: v.quantity,
        active: v.active,
      }),
      b.project_id,
    );
    return { id };
  });
}
export async function saveSupplier(
  a: Actor,
  v: z.infer<typeof supplierSchema>,
  m: Meta,
) {
  requirePermission(a, `suppliers.${v.id ? "edit" : "create"}`);
  return db().transaction(async (tx) => {
    const id = v.id || randomUUID(),
      old = v.id
        ? await one<Record<string, unknown>>(
            sql`SELECT name,active FROM suppliers WHERE id=${id} FOR UPDATE`,
            tx,
          )
        : {};
    if (!old) throw new AppError("notFound", 404);
    if (v.id)
      await tx.execute(
        sql`UPDATE suppliers SET name=${v.name},active=${v.active} WHERE id=${id}`,
      );
    else
      await tx.execute(
        sql`INSERT INTO suppliers(id,name) VALUES (${id},${v.name})`,
      );
    await audit(
      tx,
      a.id,
      m,
      v.id ? 1 : 0,
      6,
      id,
      changes(old, { name: v.name, active: v.active }),
    );
    return { id };
  });
}
export async function saveUnit(
  a: Actor,
  v: z.infer<typeof unitSchema>,
  m: Meta,
) {
  if (!canManageUnits(a)) throw new AppError("forbidden", 403);
  requirePermission(a, "boq.edit");
  return db().transaction(async (tx) => {
    const id = v.id || randomUUID(),
      old = v.id
        ? await one<Record<string, unknown>>(
            sql`SELECT name,symbol,active FROM units WHERE id=${id} FOR UPDATE`,
            tx,
          )
        : {};
    if (!old) throw new AppError("notFound", 404);
    if (v.id)
      await tx.execute(
        sql`UPDATE units SET name=${v.name},symbol=${v.symbol},active=${v.active} WHERE id=${id}`,
      );
    else
      await tx.execute(
        sql`INSERT INTO units(id,name,symbol) VALUES (${id},${v.name},${v.symbol})`,
      );
    await audit(
      tx,
      a.id,
      m,
      v.id ? 1 : 0,
      11,
      id,
      changes(old, { name: v.name, symbol: v.symbol, active: v.active }),
    );
    return { id };
  });
}
export async function saveUser(
  a: Actor,
  v: z.infer<typeof userSchema>,
  m: Meta,
) {
  requirePermission(a, `users.${v.id ? "edit" : "create"}`);
  if (v.otpEnabled && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM))
    throw new AppError("configured", 503);
  const passwordHash = v.password ? await hashPassword(v.password, 12) : null;
  return db().transaction(async (tx) => {
    const id = v.id || randomUUID(),
      old = v.id
        ? await one<Record<string, unknown>>(
            sql`SELECT name,email,username,job_title,whatsapp_country_code,whatsapp_number,whatsapp_enabled,role_id,locked,otp_enabled,otp_exempt,force_password_change,is_owner FROM users WHERE id=${id} AND deleted_at IS NULL FOR UPDATE`,
            tx,
          )
        : {};
    if (!old) throw new AppError("notFound", 404);
    if (old.is_owner && !a.is_owner) throw new AppError("owner", 403);
    if (old.is_owner && v.locked) throw new AppError("owner", 403);
    if (v.otpExempt !== Boolean(old.otp_exempt) && !a.is_owner)
      throw new AppError("forbidden", 403);
    if (
      !(await one(
        sql`SELECT id FROM roles WHERE id=${v.roleId} AND active=true`,
        tx,
      ))
    )
      throw new AppError("invalid");
    if (!a.is_owner) {
      const requested = await rows<{ key: string }>(
        sql`SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=${v.roleId}`,
        tx,
      );
      if (requested.some((p) => !a.permissions.includes(p.key)))
        throw new AppError("forbidden", 403);
    }
    for (const projectId of v.projectIds)
      await requireProject(a, projectId, tx);
    const next = {
      name: v.name,
      email: v.email,
      username: v.username,
      job_title: v.jobTitle,
      whatsapp_country_code: v.whatsappCountryCode,
      whatsapp_number: v.whatsappNumber || null,
      whatsapp_enabled: v.whatsappEnabled,
      role_id: v.roleId,
      locked: v.locked,
      otp_enabled: v.otpEnabled,
      otp_exempt: v.otpExempt,
      force_password_change: v.forcePasswordChange,
    };
    if (v.id)
      await tx.execute(
        sql`UPDATE users SET name=${v.name},email=${v.email},username=${v.username},job_title=${v.jobTitle},whatsapp_country_code=${v.whatsappCountryCode},whatsapp_number=${v.whatsappNumber || null},whatsapp_enabled=${v.whatsappEnabled},role_id=${v.roleId},locked=${v.locked},otp_enabled=${v.otpEnabled},otp_exempt=${v.otpExempt},force_password_change=${v.forcePasswordChange},password_hash=COALESCE(${passwordHash},password_hash),failed_attempts=0,locked_until=null WHERE id=${id}`,
      );
    else
      await tx.execute(
        sql`INSERT INTO users(id,name,email,username,job_title,whatsapp_country_code,whatsapp_number,whatsapp_enabled,role_id,password_hash,otp_enabled,otp_exempt,force_password_change,locked,theme) VALUES (${id},${v.name},${v.email},${v.username},${v.jobTitle},${v.whatsappCountryCode},${v.whatsappNumber || null},${v.whatsappEnabled},${v.roleId},${passwordHash!},${v.otpEnabled},${v.otpExempt},${v.forcePasswordChange},${v.locked},(SELECT default_theme FROM settings WHERE id=1))`,
      );
    const prior = await rows<{ project_id: string }>(
      sql`SELECT project_id FROM project_users WHERE user_id=${id}`,
      tx,
    );
    await tx.execute(sql`DELETE FROM project_users WHERE user_id=${id}`);
    for (const projectId of [...new Set(v.projectIds)])
      await tx.execute(
        sql`INSERT INTO project_users(project_id,user_id) VALUES (${projectId},${id})`,
      );
    if (
      v.locked ||
      passwordHash ||
      old.role_id !== v.roleId ||
      v.forcePasswordChange !== old.force_password_change
    )
      await tx.execute(
        sql`DELETE FROM sessions WHERE user_id=${id} ${id === a.id ? sql`AND id<>${a.session_id}` : sql``}`,
      );
    if (passwordHash || v.locked)
      await tx.execute(sql`DELETE FROM auth_challenges WHERE user_id=${id}`);
    await audit(tx, a.id, m, v.id ? 1 : 0, 0, id, {
      ...changes(old, next),
      ...changes(
        { projectIds: prior.map((p) => p.project_id).sort() },
        { projectIds: [...v.projectIds].sort() },
      ),
      ...(passwordHash ? { password: { changed: true } } : {}),
    });
    return { id };
  });
}
export async function saveRole(
  a: Actor,
  v: z.infer<typeof roleSchema>,
  m: Meta,
) {
  requirePermission(a, `roles.${v.id ? "edit" : "create"}`);
  if (
    !a.is_owner &&
    v.permissions.some(
      (p) => p.startsWith("audit.") || !a.permissions.includes(p),
    )
  )
    throw new AppError("forbidden", 403);
  return db().transaction(async (tx) => {
    const id = v.id || randomUUID();
    const old = v.id
      ? await one<{ name: string; active: boolean }>(
          sql`SELECT name,active FROM roles WHERE id=${id} FOR UPDATE`,
          tx,
        )
      : null;
    if (v.id && !old) throw new AppError("notFound", 404);
    const perms = await rows<{ id: string; key: string }>(
      sql`SELECT id,key FROM permissions WHERE key IN (${
        v.permissions.length
          ? sql.join(
              v.permissions.map((p) => sql`${p}`),
              sql`,`,
            )
          : sql`null`
      })`,
      tx,
    );
    if (perms.length !== new Set(v.permissions).size)
      throw new AppError("invalid");
    const previous = await rows<{ key: string }>(
      sql`SELECT p.key FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=${id}`,
      tx,
    );
    if (v.id)
      await tx.execute(
        sql`UPDATE roles SET name=${v.name},active=COALESCE(${v.active ?? null},active) WHERE id=${id}`,
      );
    else
      await tx.execute(
        sql`INSERT INTO roles(id,name,active) VALUES (${id},${v.name},${v.active ?? true})`,
      );
    await tx.execute(sql`DELETE FROM role_permissions WHERE role_id=${id}`);
    for (const p of perms)
      await tx.execute(
        sql`INSERT INTO role_permissions(role_id,permission_id) VALUES (${id},${p.id})`,
      );
    await audit(
      tx,
      a.id,
      m,
      7,
      7,
      id,
      changes(
        {
          name: old?.name,
          active: old?.active,
          permissions: previous.map((p) => p.key).sort(),
        },
        {
          name: v.name,
          ...(v.active !== undefined ? { active: v.active } : {}),
          permissions: [...v.permissions].sort(),
        },
      ),
    );
    return { id };
  });
}
export async function saveSettings(
  a: Actor,
  v: z.infer<typeof settingsSchema>,
  m: Meta,
) {
  requirePermission(a, "settings.edit");
  if (v.otpRequired && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM))
    throw new AppError("configured", 503);
  return db().transaction(async (tx) => {
    const old = (await one<Record<string, unknown>>(
      sql`SELECT * FROM settings WHERE id=1 FOR UPDATE`,
      tx,
    ))!;
    if (!a.is_owner && v.otpRequired !== old.otp_required)
      throw new AppError("forbidden", 403);
    await tx.execute(
      sql`UPDATE settings SET otp_required=${v.otpRequired},default_theme=${v.defaultTheme},digits=${v.digits},read_notification_days=${v.readNotificationDays},whatsapp_enabled=${v.whatsappEnabled} WHERE id=1`,
    );
    const policies = await rows(
      sql`SELECT * FROM notification_policy ORDER BY type`,
      tx,
    );
    for (const p of v.policies)
      await tx.execute(
        sql`UPDATE notification_policy SET in_app=${p.inApp},email=${p.email},whatsapp=${p.whatsapp},forced=${p.forced} WHERE type=${p.type}`,
      );
    await audit(
      tx,
      a.id,
      m,
      8,
      8,
      "1",
      changes(
        { ...old, policies },
        {
          otp_required: v.otpRequired,
          default_theme: v.defaultTheme,
          digits: v.digits,
          read_notification_days: v.readNotificationDays,
          whatsapp_enabled: v.whatsappEnabled,
          policies: v.policies.map((p) => ({
            type: p.type,
            in_app: p.inApp,
            email: p.email,
            whatsapp: p.whatsapp,
            forced: p.forced,
          })),
        },
      ),
    );
    return {};
  });
}
export async function savePreferences(
  a: Actor,
  v: z.infer<typeof preferencesSchema>,
  m: Meta,
) {
  if (v.otpEnabled && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM))
    throw new AppError("configured", 503);
  return db().transaction(async (tx) => {
    const previousPreferences = await rows<{
      type: number;
      in_app: boolean;
      email: boolean;
    }>(
      sql`SELECT type,in_app,email,whatsapp FROM notification_preferences WHERE user_id=${a.id} ORDER BY type`,
      tx,
    );
    const global = await one<{ otp_required: boolean }>(
      sql`SELECT otp_required FROM settings WHERE id=1`,
      tx,
    );
    if (global?.otp_required && !a.otp_exempt && !v.otpEnabled && !a.is_owner)
      throw new AppError("forbidden", 403);
    await tx.execute(
      sql`UPDATE users SET theme=COALESCE(${v.theme ?? null}::smallint,theme),otp_enabled=${v.otpEnabled} WHERE id=${a.id}`,
    );
    for (const p of v.preferences) {
      const policy = await one<{
        forced: boolean;
        in_app: boolean;
        email: boolean;
        whatsapp: boolean;
      }>(sql`SELECT * FROM notification_policy WHERE type=${p.type}`, tx);
      if (
        policy?.forced &&
        (p.inApp !== policy.in_app ||
          p.email !== policy.email ||
          p.whatsapp !== policy.whatsapp)
      )
        throw new AppError("forbidden", 403);
      await tx.execute(
        sql`INSERT INTO notification_preferences(user_id,type,in_app,email,whatsapp) VALUES (${a.id},${p.type},${p.inApp},${p.email},${p.whatsapp}) ON CONFLICT(user_id,type) DO UPDATE SET in_app=EXCLUDED.in_app,email=EXCLUDED.email,whatsapp=EXCLUDED.whatsapp`,
      );
    }
    await audit(
      tx,
      a.id,
      m,
      8,
      0,
      a.id,
      changes(
        {
          theme: a.theme,
          otp_enabled: a.otp_enabled,
          preferences: previousPreferences,
        },
        {
          theme: v.theme ?? a.theme,
          otp_enabled: v.otpEnabled,
          preferences: v.preferences
            .map((p) => ({
              type: p.type,
              in_app: p.inApp,
              email: p.email,
              whatsapp: p.whatsapp,
            }))
            .sort((x, y) => x.type - y.type),
        },
      ),
    );
    return {};
  });
}
export async function revokeSession(a: Actor, id: string, meta: Meta) {
  return db().transaction(async (tx) => {
    const s = await one<{ user_id: string; is_owner: boolean }>(
      sql`SELECT s.user_id,u.is_owner FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=${id} FOR UPDATE OF s`,
      tx,
    );
    if (!s) throw new AppError("notFound", 404);
    if (s.user_id !== a.id) {
      requirePermission(a, "security.manage");
      if (s.is_owner && !a.is_owner) throw new AppError("owner", 403);
    }
    await tx.execute(sql`DELETE FROM sessions WHERE id=${id}`);
    await audit(tx, a.id, meta, 13, 9, id);
    return {};
  });
}
