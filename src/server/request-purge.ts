import { language } from "@/messages/catalog";
import { parseLocale, type Locale } from "@/messages/types";
import { queueOtp } from "./otp-delivery";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { db, one, sql, type Executor } from "@/db";
import type { Actor } from "@/lib/domain";
import { ar } from "@/messages/ar";
import { audit, type Meta } from "./events";
import { keyedHash, rateLimit } from "./security";
import { AppError } from "./errors";
import { purgeConfirmSchema } from "@/lib/validation";
import type { z } from "zod";

function purgeHash(
  challenge: string,
  session: string,
  code: string,
  projectId?: string,
  deleteProject = !!projectId,
) {
  return keyedHash(
    projectId
      ? `${deleteProject ? "project-delete" : "project-purge"}:${projectId}:${challenge}:${session}:${code}`
      : `purge:${challenge}:${session}:${code}`,
  );
}
async function ownerSession(a: Actor, tx: Executor) {
  if (!a.is_owner) throw new AppError("forbidden", 403);
  const owner = await one<{ email: string }>(
    sql`SELECT u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=${a.id} AND s.id=${a.session_id} AND s.expires_at>now() AND u.is_owner=true AND u.deleted_at IS NULL`,
    tx,
  );
  if (!owner) throw new AppError("forbidden", 403);
  return owner;
}
export async function issueRequestPurge(
  a: Actor,
  meta: Meta,
  projectId?: string,
  deleteProject = !!projectId,
) {
  if (!a.is_owner) throw new AppError("forbidden", 403);
  if (!process.env.RESEND_API_KEY?.trim())
    throw new AppError("mailKeyMissing", 503);
  if (!process.env.EMAIL_FROM?.trim())
    throw new AppError("mailSenderMissing", 503);
  await rateLimit("purge-issue", a.id, 3, 900);
  await rateLimit("purge-issue-ip", meta.ip, 6, 900);
  return db().transaction(async (tx) => {
    await ownerSession(a, tx);
    const project = projectId
      ? await one<{ name: string }>(
          sql`SELECT name FROM projects WHERE id=${projectId}`,
          tx,
        )
      : null;
    if (projectId && !project) throw new AppError("notFound", 404);
    // One owner-level transaction prevents overlapping resends across devices.
    await tx.execute(sql`SELECT id FROM users WHERE id=${a.id} FOR UPDATE`);
    await tx.execute(
      sql`DELETE FROM outbox WHERE kind IN(2,5) AND COALESCE(payload->>'otpKey',payload->>'key') IN(SELECT 'purge:'||id::text FROM request_purge_challenges WHERE user_id=${a.id})`,
    );
    await tx.execute(
      sql`DELETE FROM request_purge_challenges WHERE user_id=${a.id}`,
    );
    const challenge = randomUUID(),
      code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await tx.execute(
      sql`INSERT INTO request_purge_challenges(id,user_id,session_id,project_id,delete_project,token_hash,expires_at) VALUES(${challenge},${a.id},${a.session_id},${projectId ?? null},${deleteProject},${purgeHash(challenge, a.session_id, code, projectId, deleteProject)},now()+interval '5 minutes')`,
    );
    const {m}=language(parseLocale(a.locale));
    const delivery = await queueOtp(
      tx,
      "purge",
      challenge,
      project ? (deleteProject ? m.interface.confirmDeleteSubject : m.interface.confirmPurgeSubject).replace("{name}",project.name) : m.settings.purgeSubject,
      code,
    );
    await audit(tx, a.id, meta, 1, 8, "1", {
      request_purge: { requested: true, projectId, deleteProject },
    });
    return { challenge, ...delivery };
  });
}
async function deleteProjectData(
  tx: Executor,
  projectId: string,
  deleteProject: boolean,
) {
  const requests = sql`SELECT id FROM purchase_requests WHERE project_id=${projectId}`;
  const sections = sql`SELECT id FROM boq_items WHERE project_id=${projectId}`;
  const project = await one<{ name: string }>(
    sql`SELECT name FROM projects WHERE id=${projectId} FOR UPDATE`,
    tx,
  );
  if (!project) throw new AppError("notFound", 404);
  const count = await one<{ n: number }>(
    sql`SELECT count(*)::int n FROM purchase_requests WHERE project_id=${projectId}`,
    tx,
  );
  await tx.execute(
    sql`SELECT id FROM purchase_requests WHERE project_id=${projectId} ORDER BY id FOR UPDATE`,
  );
  await tx.execute(
    sql`INSERT INTO outbox(kind,payload) SELECT 4,jsonb_build_object('publicId',public_id,'resourceType',resource_type,'deliveryType',delivery_type) FROM attachments WHERE request_id IN (${requests})`,
  );
  await tx.execute(
    sql`DELETE FROM outbox WHERE (kind IN(1,2,5) AND payload->>'requestId' IN (SELECT id::text FROM purchase_requests WHERE project_id=${projectId})) OR (kind=3 AND payload->>'notificationId' IN (SELECT id::text FROM notifications WHERE request_id IN (${requests})))`,
  );
  await tx.execute(
    sql`DELETE FROM receipt_lines WHERE receipt_id IN (SELECT id FROM receipts WHERE request_id IN (${requests}))`,
  );
  for (const table of [
    "attachments",
    "request_payments",
    "notifications",
    "receipts",
    "request_timeline",
    "request_lines",
  ])
    await tx.execute(
      sql`DELETE FROM ${sql.identifier(table)} WHERE request_id IN (${requests})`,
    );
  await tx.execute(
    sql`DELETE FROM purchase_requests WHERE project_id=${projectId}`,
  );
  await tx.execute(
    sql`DELETE FROM project_request_counters WHERE project_id=${projectId}`,
  );
  if (!deleteProject) return { ...project, deleted: count!.n };
  await tx.execute(
    sql`DELETE FROM catalog_counters WHERE scope=${projectId} OR scope IN (${sections})`,
  );
  await tx.execute(
    sql`DELETE FROM materials WHERE boq_item_id IN (${sections})`,
  );
  await tx.execute(sql`DELETE FROM boq_items WHERE project_id=${projectId}`);
  await tx.execute(
    sql`DELETE FROM project_users WHERE project_id=${projectId}`,
  );
  await tx.execute(sql`DELETE FROM projects WHERE id=${projectId}`);
  return { ...project, deleted: count!.n };
}
export async function purgeRequests(
  a: Actor,
  input: z.infer<typeof purgeConfirmSchema>,
  meta: Meta,
  projectId?: string,
  deleteProject = !!projectId,
) {
  if (!a.is_owner) throw new AppError("forbidden", 403);
  await rateLimit("purge-confirm", a.id, 10, 900);
  const result = await db().transaction(async (tx) => {
    await ownerSession(a, tx);
    const challenge = await one<{ id: string; token_hash: string }>(
      sql`SELECT id,token_hash FROM request_purge_challenges WHERE id=${input.challenge} AND user_id=${a.id} AND session_id=${a.session_id} AND project_id IS NOT DISTINCT FROM ${projectId ?? null}::uuid AND delete_project=${deleteProject} AND expires_at>now() AND attempts<5 AND verified_at IS NULL FOR UPDATE`,
      tx,
    );
    if (!challenge) return null;
    await tx.execute(
      sql`UPDATE request_purge_challenges SET attempts=attempts+1 WHERE id=${challenge.id}`,
    );
    const candidate = purgeHash(
      challenge.id,
      a.session_id,
      input.code,
      projectId,
      deleteProject,
    );
    if (
      candidate.length !== challenge.token_hash.length ||
      !timingSafeEqual(
        Buffer.from(candidate),
        Buffer.from(challenge.token_hash),
      )
    ) {
      await audit(tx, a.id, meta, 6, 8, "1", {
        request_purge: { confirmed: false },
      });
      return null;
    }
    // Prevent creation and request writes from racing deletion or counter reset.
    await tx.execute(
      sql`LOCK TABLE purchase_requests IN ACCESS EXCLUSIVE MODE`,
    );
    if (projectId) {
      await tx.execute(
        sql`UPDATE request_purge_challenges SET verified_at=now() WHERE id=${challenge.id}`,
      );
      await tx.execute(
        sql`SELECT set_config('siteflow.purge_challenge',${challenge.id},true)`,
      );
      const project = await deleteProjectData(tx, projectId, deleteProject);
      await audit(
        tx,
        a.id,
        meta,
        2,
        deleteProject ? 1 : 4,
        deleteProject ? projectId : null,
        deleteProject
          ? { name: { before: project.name, after: null } }
          : {
              requests: { before: project.deleted, after: 0 },
              sequence: { after: 0 },
            },
        projectId,
      );
      await tx.execute(
        sql`DELETE FROM outbox WHERE kind IN(2,5) AND COALESCE(payload->>'otpKey',payload->>'key')=${"purge:" + challenge.id}`,
      );
      await tx.execute(
        sql`DELETE FROM request_purge_challenges WHERE id=${challenge.id}`,
      );
      return { deleted: deleteProject ? 1 : project.deleted };
    }
    const counts = await one<{
      requests: number;
      receipts: number;
      attachments: number;
    }>(
      sql`SELECT (SELECT count(*)::int FROM purchase_requests) requests,(SELECT count(*)::int FROM receipts) receipts,(SELECT count(*)::int FROM attachments) attachments`,
      tx,
    );
    await tx.execute(
      sql`UPDATE request_purge_challenges SET verified_at=now() WHERE id=${challenge.id}`,
    );
    await tx.execute(
      sql`SELECT set_config('siteflow.purge_challenge',${challenge.id},true)`,
    );
    // File removal is retried by the background worker; no unbounded file list is loaded.
    await tx.execute(
      sql`INSERT INTO outbox(kind,payload) SELECT 4,jsonb_build_object('publicId',public_id,'resourceType',resource_type,'deliveryType',delivery_type) FROM attachments`,
    );
    await tx.execute(
      sql`DELETE FROM outbox WHERE kind IN(1,3) OR (kind IN(2,5) AND (payload ? 'requestId' OR COALESCE(payload->>'otpKey',payload->>'key')=${`purge:${challenge.id}`})) OR (kind=2 AND payload->>'key' ~ '^[0-9a-f-]{36}:[0-9a-f-]{36}$')`,
    );
    for (const table of [
      "notifications",
      "attachments",
      "request_payments",
      "receipt_lines",
      "receipts",
      "request_timeline",
      "request_lines",
      "purchase_requests",
      "project_request_counters",
    ])
      await tx.execute(sql`DELETE FROM ${sql.identifier(table)}`);
    await audit(tx, a.id, meta, 2, 4, null, {
      requests: { before: counts!.requests, after: 0 },
      receipts: { before: counts!.receipts, after: 0 },
      attachments: { before: counts!.attachments, after: 0 },
    });
    await tx.execute(
      sql`DELETE FROM request_purge_challenges WHERE id=${challenge.id}`,
    );
    return { deleted: counts!.requests };
  });
  if (!result) throw new AppError("purge", 400);
  return result;
}
