import { language } from "@/messages/catalog";
import { parseLocale, type Locale } from "@/messages/types";
import { departmentScope } from "./access";
import { requestLink } from "@/lib/request-links";
import { prepareRequestEmail } from "./request-email";
import { otpRecipient, isOtpKey } from "./otp-delivery";
import { emailLogos } from "./email-logo";
import { Resend } from "resend";
import { db, sql, one, rows } from "@/db";
import { decrypt } from "./security";
import { ar } from "@/messages/ar";
import { requestCode, effectivePreference } from "@/lib/domain-email";
import { deliverPush, pushConfigured } from "./push";
import { cloud } from "./cloudinary";
import { queueWhatsApp, deliverWhatsApp } from "./whatsapp";
import { whatsappRecipient } from "@/lib/whatsapp-phone";
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
      sql`UPDATE outbox SET locked_until=now()+interval '2 minutes',attempts=attempts+1 WHERE id=(SELECT id FROM outbox WHERE available_at<=now() AND (locked_until IS NULL OR locked_until<now()) ORDER BY CASE WHEN (kind=5 AND (payload ? 'otpKey' OR payload ? 'recoveryChallenge')) OR (kind=2 AND NOT (payload ? 'requestId')) THEN -1 ELSE 0 END, CASE kind WHEN 2 THEN 0 WHEN 3 THEN 1 WHEN 5 THEN 1 WHEN 1 THEN 2 ELSE 3 END,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
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
            number: string;
            status: number;
            visited: number[];
          }>(
            sql`SELECT project_id,created_by,number,status,ARRAY(SELECT DISTINCT t.to_status FROM request_timeline t WHERE t.request_id=r.id) visited FROM purchase_requests r WHERE id=${requestId}`,
            tx,
          );
          if (request) {
            const policy = await one<{
              in_app: boolean;
              email: boolean;
              whatsapp: boolean;
              forced: boolean;
            }>(sql`SELECT * FROM notification_policy WHERE type=${type}`, tx);
            const whatsappSystem = await one<{ whatsapp_enabled: boolean }>(
              sql`SELECT whatsapp_enabled FROM settings WHERE id=1`,
              tx,
            );
            const link = requestLink(requestId);
            const users = await rows<{
              id: string;
              is_owner: boolean;
              permissions: string[];
              locale: string | null;
              workflow_role: string | null;
              email: string;
              in_app: boolean | null;
              email_enabled: boolean | null;
              whatsapp_preference: boolean | null;
              whatsapp_enabled: boolean;
              whatsapp_country_code: string;
              whatsapp_number: string | null;
            }>(
              sql`SELECT u.id,u.locale,u.is_owner,enabled_role.workflow_role,COALESCE((SELECT json_agg(p.key) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id),'[]'::json) permissions,u.email,u.whatsapp_country_code,u.whatsapp_number,u.whatsapp_enabled,np.in_app,np.email email_enabled,np.whatsapp whatsapp_preference FROM users u JOIN roles enabled_role ON enabled_role.id=u.role_id AND enabled_role.active LEFT JOIN notification_preferences np ON np.user_id=u.id AND np.type=${type} WHERE u.deleted_at IS NULL AND u.locked=false AND u.id<>${actorId} AND (u.is_owner OR (EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.key='requests.view') AND (EXISTS(SELECT 1 FROM project_users pu WHERE pu.user_id=u.id AND pu.project_id=${request.project_id}) OR EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.key='projects.all')) AND (u.id=${request.created_by} OR EXISTS(SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id AND p.key='requests.view_all')))) ORDER BY u.id LIMIT 1000`,
              tx,
            );
            for (const u of users) {
              const {m:ar}=language(parseLocale(u.locale));
              const department = departmentScope(u);
              if (
                !u.is_owner &&
                request.created_by !== u.id &&
                (request.status === 0 ||
                  (department &&
                    !department.statuses.includes(request.status) &&
                    !request.visited.includes(department.start)))
              )
                continue;
              const pref = effectivePreference(
                policy || {
                  in_app: true,
                  email: true,
                  whatsapp: true,
                  forced: false,
                },
                u.in_app === null
                  ? undefined
                  : {
                      in_app: u.in_app,
                      email: !!u.email_enabled,
                      whatsapp: u.whatsapp_preference ?? true,
                    },
              );
              if (
                pref.in_app ||
                (job.payload.technicalReturn &&
                  (u.id === request.created_by ||
                    u.workflow_role === "construction"))
              ) {
                const notification = await one<{ id: string }>(
                  sql`INSERT INTO notifications(user_id,event_id,type,request_id) VALUES (${u.id},${job.id},${type},${requestId}) ON CONFLICT(user_id,event_id) DO NOTHING RETURNING id`,
                  tx,
                );
                if (notification && pushConfigured())
                  await tx.execute(
                    sql`INSERT INTO outbox(kind,payload) VALUES(3,${JSON.stringify({ notificationId: notification.id })}::jsonb)`,
                  );
              }
              const to = whatsappRecipient(
                u.whatsapp_country_code,
                u.whatsapp_number || "",
              );
              if (
                whatsappSystem?.whatsapp_enabled &&
                u.whatsapp_enabled &&
                pref.whatsapp &&
                to
              ) {
                await queueWhatsApp(tx, {
                  userId: u.id,
                  requestId,
                  type,
                  to,
                  text: `${ar.brand}\n${ar.notificationTypes[type]} · ${requestCode(request.number)}\n${ar.email.viewRequest}: ${link}`,
                  key: `whatsapp:${job.id}:${u.id}`,
                });
              }
              if (pref.email) {
                await tx.execute(
                  sql`INSERT INTO outbox(kind,payload) VALUES (2,${JSON.stringify({ requestId, userId: u.id, eventType: type, key: job.id + ":" + u.id })}::jsonb)`,
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
      } else if (job.kind === 5) {
        await deliverWhatsApp(job.payload);
        await db().execute(sql`DELETE FROM outbox WHERE id=${job.id}`);
      } else if (job.kind === 4) {
        const result = await cloud().uploader.destroy(
          String(job.payload.publicId),
          {
            resource_type: String(job.payload.resourceType),
            type: String(job.payload.deliveryType || "authenticated"),
            invalidate: true,
          },
        );
        if (result.result !== "ok" && result.result !== "not found")
          throw new Error("File cleanup failed");
        await db().execute(sql`DELETE FROM outbox WHERE id=${job.id}`);
      } else {
        if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
          throw new Error("Email not configured");
        const recipientId =
          job.payload.userId ??
          (typeof job.payload.key === "string"
            ? job.payload.key.split(":")[1]
            : undefined);
        const mail =
          job.payload.requestId && typeof recipientId === "string"
            ? await prepareRequestEmail(
                recipientId,
                String(job.payload.requestId),
                typeof job.payload.eventType === "number"
                  ? job.payload.eventType
                  : undefined,
              )
            : decrypt<{ to: string; subject: string; html: string }>(
                String(job.payload.encrypted),
              );
        if (
          !mail ||
          (mail.subject === ar.email.resetSubject &&
            mail.html.includes("?reset="))
        ) {
          await db().execute(sql`DELETE FROM outbox WHERE id=${job.id}`);
          continue;
        }
        if (
          isOtpKey(job.payload.key) &&
          (await otpRecipient(job.payload.key))?.email !== mail.to
        ) {
          await db().execute(sql`DELETE FROM outbox WHERE id=${job.id}`);
          continue;
        }
        const r = await new Resend(process.env.RESEND_API_KEY).emails.send(
          { from: process.env.EMAIL_FROM, ...mail, attachments: emailLogos },
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
    // Abandoned receipt uploads never appear as evidence. Use the same durable file cleanup as a request purge.
    await tx.execute(sql`WITH expired AS (
      SELECT id FROM attachments WHERE ((receipt_key IS NOT NULL AND receipt_id IS NULL) OR (upload_key IS NOT NULL AND linked_at IS NULL))
      AND created_at<now()-interval '1 day' ORDER BY created_at LIMIT 500 FOR UPDATE SKIP LOCKED
    ), removed AS (
      DELETE FROM attachments a USING expired WHERE a.id=expired.id RETURNING a.public_id,a.resource_type,a.delivery_type
    ) INSERT INTO outbox(kind,payload) SELECT 4,jsonb_build_object('publicId',public_id,'resourceType',resource_type,'deliveryType',delivery_type) FROM removed`);
    await tx.execute(sql`DELETE FROM rate_limits WHERE expires_at<now()`);
    await tx.execute(
      sql`DELETE FROM notifications WHERE read_at<now()-(SELECT read_notification_days FROM settings WHERE id=1)*interval '1 day'`,
    );
    await tx.execute(
      sql`SELECT ensure_audit_partition(now()+interval '1 month')`,
    );
  });
}
