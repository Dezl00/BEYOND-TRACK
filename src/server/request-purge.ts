import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { db, one, sql, type Executor } from "@/db";
import type { Actor } from "@/lib/domain";
import { ar } from "@/messages/ar";
import { audit, queueEmail, type Meta } from "./events";
import { keyedHash, rateLimit } from "./security";
import { AppError } from "./errors";
import { purgeConfirmSchema } from "@/lib/validation";
import type { z } from "zod";

async function ownerSession(a: Actor, tx: Executor) {
  if (!a.is_owner) throw new AppError("forbidden", 403);
  const owner = await one<{ email: string }>(
    sql`SELECT u.email FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=${a.id} AND s.id=${a.session_id} AND s.expires_at>now() AND u.is_owner=true AND u.deleted_at IS NULL`,
    tx,
  );
  if (!owner) throw new AppError("forbidden", 403);
  return owner;
}
export async function issueRequestPurge(a: Actor, meta: Meta) {
  if (!a.is_owner) throw new AppError("forbidden", 403);
  if (!process.env.RESEND_API_KEY?.trim())
    throw new AppError("mailKeyMissing", 503);
  if (!process.env.EMAIL_FROM?.trim())
    throw new AppError("mailSenderMissing", 503);
  await rateLimit("purge-issue", a.id, 3, 900);
  await rateLimit("purge-issue-ip", meta.ip, 6, 900);
  return db().transaction(async (tx) => {
    const owner = await ownerSession(a, tx);
    // One owner-level transaction prevents overlapping resends across devices.
    await tx.execute(sql`SELECT id FROM users WHERE id=${a.id} FOR UPDATE`);
    await tx.execute(
      sql`DELETE FROM outbox WHERE kind=2 AND payload->>'key' IN(SELECT 'purge:'||id::text FROM request_purge_challenges WHERE user_id=${a.id})`,
    );
    await tx.execute(
      sql`DELETE FROM request_purge_challenges WHERE user_id=${a.id}`,
    );
    const challenge = randomUUID(),
      code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await tx.execute(
      sql`INSERT INTO request_purge_challenges(id,user_id,session_id,token_hash,expires_at) VALUES(${challenge},${a.id},${a.session_id},${keyedHash(`purge:${challenge}:${a.session_id}:${code}`)},now()+interval '5 minutes')`,
    );
    await queueEmail(
      tx,
      owner.email,
      ar.settings.purgeSubject,
      `<html lang="ar" dir="rtl"><body><p>${ar.settings.purgeBody}</p><p dir="ltr">${code}</p><p>${ar.email.otpExpiry}</p></body></html>`,
      `purge:${challenge}`,
    );
    await audit(tx, a.id, meta, 1, 8, "1", {
      request_purge: { requested: true },
    });
    return { challenge, email: owner.email };
  });
}
export async function purgeRequests(
  a: Actor,
  input: z.infer<typeof purgeConfirmSchema>,
  meta: Meta,
) {
  if (!a.is_owner) throw new AppError("forbidden", 403);
  await rateLimit("purge-confirm", a.id, 10, 900);
  const result = await db().transaction(async (tx) => {
    await ownerSession(a, tx);
    const challenge = await one<{ id: string; token_hash: string }>(
      sql`SELECT id,token_hash FROM request_purge_challenges WHERE id=${input.challenge} AND user_id=${a.id} AND session_id=${a.session_id} AND expires_at>now() AND attempts<5 AND verified_at IS NULL FOR UPDATE`,
      tx,
    );
    if (!challenge) return null;
    await tx.execute(
      sql`UPDATE request_purge_challenges SET attempts=attempts+1 WHERE id=${challenge.id}`,
    );
    const candidate = keyedHash(
      `purge:${challenge.id}:${a.session_id}:${input.code}`,
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
    // Serialize all request writes, including concurrent creation and receipt entry.
    await tx.execute(
      sql`LOCK TABLE purchase_requests IN ACCESS EXCLUSIVE MODE`,
    );
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
      sql`INSERT INTO outbox(kind,payload) SELECT 4,jsonb_build_object('publicId',public_id,'resourceType',resource_type) FROM attachments`,
    );
    await tx.execute(
      sql`DELETE FROM outbox WHERE kind IN(1,3,5) OR (kind=2 AND (payload ? 'requestId' OR payload->>'key' ~ '^[0-9a-f-]{36}:[0-9a-f-]{36}$' OR payload->>'key'=${`purge:${challenge.id}`}))`,
    );
    for (const table of [
      "notifications",
      "attachments",
      "receipt_lines",
      "receipts",
      "request_timeline",
      "request_lines",
      "purchase_requests",
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
