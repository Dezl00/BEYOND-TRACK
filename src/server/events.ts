import { randomUUID } from "node:crypto";
import { db, sql, type Executor } from "@/db";
import { encrypt } from "./security";
export type Meta = { ip: string; userAgent: string };
export async function audit(
  conn: Executor,
  actorId: string | null,
  meta: Meta,
  action: number,
  entity: number,
  entityId: string | null,
  diff: unknown = {},
  projectId: string | null = null,
) {
  const payload = {
    id: randomUUID(),
    actor_id: actorId,
    project_id: projectId,
    action,
    entity,
    entity_id: entityId,
    ip: meta.ip,
    user_agent: meta.userAgent,
    diff,
    created_at: new Date().toISOString(),
  };
  await conn.execute(
    sql`INSERT INTO outbox(kind,payload) VALUES (0,${JSON.stringify(payload)}::jsonb)`,
  );
}
export function changes(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(after)
      .filter(([k, v]) => JSON.stringify(before[k]) !== JSON.stringify(v))
      .map(([k, v]) => [k, { before: before[k] ?? null, after: v }]),
  );
}
export async function notify(
  conn: Executor,
  requestId: string,
  type: number,
  actorId: string,
) {
  await conn.execute(
    sql`INSERT INTO outbox(kind,payload) VALUES (1,${JSON.stringify({ requestId, type, actorId })}::jsonb)`,
  );
}
export async function queueEmail(
  conn: Executor,
  to: string,
  subject: string,
  html: string,
  key?: string,
  requestId?: string,
) {
  await conn.execute(
    sql`INSERT INTO outbox(kind,payload) VALUES (2,${JSON.stringify({ encrypted: encrypt({ to, subject, html }), key, requestId })}::jsonb)`,
  );
}
export async function authAudit(
  actorId: string | null,
  meta: Meta,
  action: number,
  diff: unknown = {},
) {
  await audit(db(), actorId, meta, action, 0, actorId, diff);
}
