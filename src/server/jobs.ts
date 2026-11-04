import { Resend } from "resend";
import { db, sql, one, rows } from "@/db";
import { decrypt } from "./security";
import { queueEmail } from "./events";
import { ar } from "@/messages/ar";
import { requestCode, effectivePreference } from "@/lib/domain-email";
import { deliverPush, pushConfigured } from "./push";
import { cloud } from "./cloudinary";
type Job = {
  id: string;
  kind: number;
  payload: Record<string, unknown>;
  attempts: number;
};
export async function processJobs(limit = 20) {
  let processed = 0;
  const deadline = Date.now() + 20_000;
  for (let n = 0; n < limit; n++) {
    if (Date.now() > deadline) break;
    const job = await one<Job>(
      sql`UPDATE outbox SET locked_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=(SELECT id FROM outbox WHERE available_at<=now() AND (locked_until IS NULL OR locked_until<now()) ORDER BY CASE kind WHEN 2 THEN 0 WHEN 3 THEN 1 WHEN 1 THEN 2 ELSE 3 END,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    );
    if (!job) break;
    try {
      if (job.kind === 0)
        await db().transaction(async (tx) => {
          const p = job.payload;
          await tx.execute(
            sql`SELECT ensure_audit_partition(${String(p.created_at)}::timestamptz)`,
          );
          await tx.execute(
            sql`INSERT INTO audit_log(id,actor_id,project_id,action,entity,entity_id,ip,user_agent,diff,created_at) VALUES (${String(p.id)}::uuid,${p.actor_id as string | null}::uuid,${p.project_id as string | null}::uuid,${Number(p.action)},${Number(p.entity)},${p.entity_id as string | null},${String(p.ip)},${String(p.user_agent)},${JSON.stringify(p.diff)}::jsonb,${String(p.created_at)}::timestamptz) ON CONFLICT(created_at,id) DO NOTHING`,
          );
          await tx.execute(sql`DELETE FROM outbox WHERE id=${job.id}`);
        });
      else if (job.kind === 1)
        await db().transaction(async (tx) => {
          const requestId = String(job.payload.requestId),
            type = Number(job.payload.type),
            actorId = String(job.payload.actorId);
          const request = await one<{
            project_id: string;
            created_by: string;
            number: number;
            status: number;
          }>(
            sql`SELECT project_id,created_by,number,status FROM purchase_requests WHERE id=${requestId}`,
            tx,
          );
          if (request) {
            const policy = await one<{
              in_app: boolean;
              email: boolean;
              forced: boolean;
            }>(sql`SELECT * FROM notification_policy WHERE type=${type}`, tx);
            const users = await rows<{
              id: string;
              email: string;
              in_app: boolean | null;
              email_enabled: boolean | null;
            }>(
              sql`SELECT u.id,u.email,np.in_app,np.email email_enabled FROM users u LEFT JOIN notification_preferences np ON np.user_id=u.id AND np.type=${type} WHERE u.deleted_at IS NULL AND EXISTS(SELECT 1 FROM roles enabled_role WHERE enabled_role.id=u.role_id AND enabled_role.active=true) AND u.locked=false AND u.id<>${actorId} AND (u.is_owner OR (EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.key='requests.view') AND (EXISTS(SELECT 1 FROM project_users pu WHERE pu.user_id=u.id AND pu.project_id=${request.project_id}) OR EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.key='projects.all')) AND (u.id=${request.created_by} OR EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.key='requests.view_all')))) AND (u.is_owner OR u.id=${request.created_by} OR EXISTS(SELECT 1 FROM role_permissions vp JOIN permissions vk ON vk.id=vp.permission_id WHERE vp.role_id=u.role_id AND vk.key='technical.view') OR (EXISTS(SELECT 1 FROM role_permissions vp JOIN permissions vk ON vk.id=vp.permission_id WHERE vp.role_id=u.role_id AND vk.key='finance.view') AND (${request.status} IN(2,3,4,5,6,9) OR EXISTS(SELECT 1 FROM request_timeline st WHERE st.request_id=${requestId} AND st.from_status=9))) OR (EXISTS(SELECT 1 FROM role_permissions vp JOIN permissions vk ON vk.id=vp.permission_id WHERE vp.role_id=u.role_id AND vk.key='procurement.view') AND NOT EXISTS(SELECT 1 FROM role_permissions vp JOIN permissions vk ON vk.id=vp.permission_id WHERE vp.role_id=u.role_id AND vk.key='finance.view') AND (${request.status} IN(2,3,4,5,6) OR EXISTS(SELECT 1 FROM request_timeline st WHERE st.request_id=${requestId} AND st.from_status=2))) OR (NOT EXISTS(SELECT 1 FROM role_permissions vp JOIN permissions vk ON vk.id=vp.permission_id WHERE vp.role_id=u.role_id AND vk.key='finance.view') AND NOT EXISTS(SELECT 1 FROM role_permissions vp JOIN permissions vk ON vk.id=vp.permission_id WHERE vp.role_id=u.role_id AND vk.key='procurement.view'))) ORDER BY u.id LIMIT 1000`,
              tx,
            );
            for (const u of users) {
              const pref = effectivePreference(
                policy || { in_app: true, email: true, forced: false },
                u.in_app === null
                  ? undefined
                  : { in_app: u.in_app, email: !!u.email_enabled },
              );
              if (pref.in_app) {
                const notification = await one<{ id: string }>(
                  sql`INSERT INTO notifications(user_id,event_id,type,request_id) VALUES (${u.id},${job.id},${type},${requestId}) ON CONFLICT(user_id,event_id) DO NOTHING RETURNING id`,
                  tx,
                );
                if (notification && pushConfigured())
                  await tx.execute(
                    sql`INSERT INTO outbox(kind,payload) VALUES(3,${JSON.stringify({ notificationId: notification.id })}::jsonb)`,
                  );
              }
              if (pref.email) {
                const link = new URL(
                  `/requests/${requestId}`,
                  process.env.APP_URL || "http://localhost:3000",
                );
                await queueEmail(
                  tx,
                  u.email,
                  ar.email.notificationSubject,
                  `<html lang="ar" dir="rtl"><body><p>${ar.notificationTypes[type]} · ${requestCode(request.number)}</p><a href="${link}">${ar.email.viewRequest}</a></body></html>`,
                  `${job.id}:${u.id}`,
                  requestId,
                );
              }
            }
          }
          await tx.execute(sql`DELETE FROM outbox WHERE id=${job.id}`);
        });
      else if (job.kind === 3) {
        const targets = await rows<{ id: string }>(
          sql`SELECT s.id FROM push_subscriptions s JOIN notifications n ON n.user_id=s.user_id WHERE n.id=${String(job.payload.notificationId)} LIMIT 10`,
        );
        await Promise.all(
          targets.map((target) =>
            deliverPush(target.id, String(job.payload.notificationId)),
          ),
        );
        await db().execute(sql`DELETE FROM outbox WHERE id=${job.id}`);
      } else if (job.kind === 4) {
        const result = await cloud().uploader.destroy(
          String(job.payload.publicId),
          {
            resource_type: String(job.payload.resourceType),
            type: "authenticated",
            invalidate: true,
          },
        );
        if (result.result !== "ok" && result.result !== "not found")
          throw new Error("File cleanup failed");
        await db().execute(sql`DELETE FROM outbox WHERE id=${job.id}`);
      } else {
        if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
          throw new Error("Email not configured");
        const mail = decrypt<{ to: string; subject: string; html: string }>(
          String(job.payload.encrypted),
        );
        const r = await new Resend(process.env.RESEND_API_KEY).emails.send(
          { from: process.env.EMAIL_FROM, ...mail },
          { idempotencyKey: String(job.payload.key || job.id) },
        );
        if (r.error) throw new Error("Email delivery failed");
        await db().execute(sql`DELETE FROM outbox WHERE id=${job.id}`);
      }
      processed++;
    } catch {
      await db().execute(
        sql`UPDATE outbox SET locked_until=null,available_at=now()+${Math.min(3600, 2 ** Math.min(job.attempts, 10) * 15)}*interval '1 second' WHERE id=${job.id}`,
      );
    }
  }
  return processed;
}
export async function maintain() {
  await db().transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM auth_challenges WHERE expires_at<now()`);
    await tx.execute(
      sql`DELETE FROM request_purge_challenges WHERE expires_at<now()`,
    );
    await tx.execute(
      sql`DELETE FROM sessions WHERE expires_at<now()-interval '1 day'`,
    );
    await tx.execute(sql`DELETE FROM rate_limits WHERE expires_at<now()`);
    await tx.execute(
      sql`DELETE FROM notifications WHERE read_at<now()-(SELECT read_notification_days FROM settings WHERE id=1)*interval '1 day'`,
    );
    await tx.execute(
      sql`SELECT ensure_audit_partition(now()+interval '1 month')`,
    );
  });
}
