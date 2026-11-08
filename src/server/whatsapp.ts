import { one, sql, type Executor } from "@/db";
import { can, type Actor } from "@/lib/domain";
import { whatsappRecipient } from "@/lib/whatsapp-phone";
import { encrypt, decrypt } from "./security";
import { requestScope } from "./access";
import { sendWhatsApp } from "./whatsapp-gateway";

type WhatsAppJob = {
  userId: string;
  requestId: string;
  type: number;
  encrypted: string;
  key: string;
};

export async function queueWhatsApp(
  conn: Executor,
  target: {
    userId: string;
    requestId: string;
    type: number;
    to: string;
    text: string;
    key: string;
  },
) {
  const { to, text, ...reference } = target;
  await conn.execute(
    sql`INSERT INTO outbox(kind,payload) VALUES(5,${JSON.stringify({ ...reference, encrypted: encrypt({ to, text }) })}::jsonb)`,
  );
}

export async function deliverWhatsApp(payload: Record<string, unknown>) {
  const job = payload as WhatsAppJob;
  const user = await one<
    Actor & {
      locked: boolean;
      deleted_at: Date | null;
      role_active: boolean;
      whatsapp_enabled: boolean;
      whatsapp_country_code: string;
      whatsapp_number: string | null;
    }
  >(
    sql`SELECT u.*,r.active role_active,COALESCE((SELECT json_agg(p.key) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id),'[]'::json) permissions FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=${job.userId}`,
  );
  if (
    !user ||
    user.deleted_at ||
    user.locked ||
    !user.role_active ||
    !user.whatsapp_enabled ||
    !user.whatsapp_number ||
    !can(user, "requests.view")
  )
    return;
  const enabled = await one<{ enabled: boolean }>(
    sql`SELECT s.whatsapp_enabled AND CASE WHEN p.forced THEN p.whatsapp ELSE COALESCE(n.whatsapp,p.whatsapp) END enabled FROM settings s CROSS JOIN notification_policy p LEFT JOIN notification_preferences n ON n.type=p.type AND n.user_id=${user.id} WHERE s.id=1 AND p.type=${job.type}`,
  );
  if (!enabled?.enabled) return;
  if (
    !(await one(
      sql`SELECT r.id FROM purchase_requests r WHERE r.id=${job.requestId} AND ${requestScope(user)}`,
    ))
  )
    return;
  const message = decrypt<{ to: string; text: string }>(job.encrypted);
  // A queued message belongs only to the number configured when the event occurred.
  if (
    whatsappRecipient(user.whatsapp_country_code, user.whatsapp_number) !==
    message.to
  )
    return;
  await sendWhatsApp(message.to, message.text, job.key);
}
