import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { db, sql, one } from "../src/db";
import { ar } from "../src/messages/ar";
import {
  modules,
  actionsForModule,
  specialPermissions,
} from "../src/lib/domain";
import { password } from "../src/lib/validation";
async function seed() {
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase(),
    name = process.env.SEED_ADMIN_NAME,
    pass = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !name || !pass)
    throw new Error(
      "SEED_ADMIN_EMAIL, SEED_ADMIN_NAME and SEED_ADMIN_PASSWORD are required",
    );
  password.parse(pass);
  const passwordHash = await hash(pass, 12);
  await db().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741292)`);
    await tx.execute(
      sql`INSERT INTO settings(id) VALUES (1) ON CONFLICT DO NOTHING`,
    );
    for (let type = 0; type < 3; type++)
      await tx.execute(
        sql`INSERT INTO notification_policy(type) VALUES (${type}) ON CONFLICT DO NOTHING`,
      );
    const permissions = new Map<string, string>();
    for (const key of [
      ...modules.flatMap((mod) =>
        actionsForModule(mod).map((action) => `${mod}.${action}`),
      ),
      ...specialPermissions,
    ]) {
      const [mod, action] = key.split(".");
      const label = `${mod === "security" ? ar.common.security : ar.nav[mod as keyof typeof ar.nav]} · ${mod === "reports" && action === "export" ? ar.reports.exportPrint : ar.permissionActions[action as keyof typeof ar.permissionActions]}`;
      await tx.execute(
        sql`INSERT INTO permissions(key,label) VALUES (${key},${label}) ON CONFLICT(key) DO NOTHING`,
      );
      const p = await one<{ id: string }>(
        sql`SELECT id FROM permissions WHERE key=${key}`,
        tx,
      );
      permissions.set(key, p!.id);
    }
    const all = [...permissions.keys()].filter((p) => !p.startsWith("audit."));
    const defaults = [
      { name: ar.roles.owner, keys: [] },
      { name: ar.roles.admin, keys: all },
      {
        name: ar.roles.engineer,
        keys: [
          "projects.view",
          "boq.view",
          "requests.view",
          "requests.create",
          "requests.edit",
          "requests.delete",
          "requests.export",
        ],
      },
      {
        name: ar.roles.procurement,
        keys: [
          "projects.view",
          "projects.all",
          "requests.view",
          "requests.view_all",
          "requests.export",
          "procurement.view",
          "procurement.edit",
          "procurement.approve",
          "procurement.export",
          "suppliers.view",
          "suppliers.create",
          "suppliers.edit",
        ],
      },
      {
        name: ar.roles.technical,
        keys: [
          "projects.view",
          "projects.all",
          "boq.view",
          "requests.view",
          "requests.view_all",
          "requests.export",
          "requests.approve",
          "technical.view",
          "technical.approve",
          "technical.export",
        ],
      },
      {
        name: ar.roles.finance,
        keys: [
          "projects.view",
          "projects.all",
          "requests.view",
          "requests.view_all",
          "requests.export",
          "finance.view",
          "finance.approve",
          "finance.export",
        ],
      },
      {
        name: ar.roles.receiver,
        keys: [
          "projects.view",
          "boq.view",
          "requests.view",
          "requests.view_all",
          "receipts.view",
          "receipts.create",
          "receipts.export",
        ],
      },
    ];
    let ownerRole = "";
    for (const role of defaults) {
      const existing = await one<{ id: string }>(
        sql`SELECT id FROM roles WHERE name=${role.name}`,
        tx,
      );
      const id = existing?.id || randomUUID();
      if (!existing) {
        await tx.execute(
          sql`INSERT INTO roles(id,name,system,unit_supervisor) VALUES (${id},${role.name},true,${role.name === ar.roles.admin})`,
        );
        for (const key of role.keys)
          await tx.execute(
            sql`INSERT INTO role_permissions(role_id,permission_id) VALUES (${id},${permissions.get(key)!})`,
          );
      }
      if (role.name === ar.roles.owner) ownerRole = id;
    }
    for (const [name, symbol] of ar.seed.units)
      await tx.execute(
        sql`INSERT INTO units(name,symbol) VALUES (${name},${symbol}) ON CONFLICT(name) DO NOTHING`,
      );
    const owner = await one<{ id: string }>(
      sql`SELECT id FROM users WHERE is_owner=true`,
      tx,
    );
    if (!owner)
      await tx.execute(
        sql`INSERT INTO users(name,email,username,job_title,password_hash,role_id,is_owner,force_password_change) VALUES (${name},${email},${process.env.SEED_ADMIN_USERNAME || "owner"},${ar.roles.owner},${passwordHash},${ownerRole},true,true)`,
      );
    if (process.env.SEED_PROJECT_NAME && process.env.SEED_PROJECT_CODE)
      await tx.execute(
        sql`INSERT INTO projects(code,name) VALUES (${process.env.SEED_PROJECT_CODE},${process.env.SEED_PROJECT_NAME}) ON CONFLICT(code) DO NOTHING`,
      );
  });
  console.log(
    "Seed completed. Existing accounts and role mappings were preserved.",
  );
}
seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      "Seed failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exit(1);
  });
