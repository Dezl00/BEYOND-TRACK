import { language } from "@/messages/catalog";
import { parseLocale, type Locale } from "@/messages/types";
import webpush from "web-push";
import { db, one, sql } from "@/db";
import { ar } from "@/messages/ar";
import { requestScope } from "./access";
import type { Actor } from "@/lib/domain";
export function pushConfigured() {
  return !!(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}
export async function deliverPush(
  subscriptionId: string,
  notificationId: string,
) {
  const data = await one<{
    endpoint: string;
    p256dh: string;
    auth: string;
    user_id: string;
    type: number;
    request_id: string;
  }>(
    sql`SELECT s.endpoint,s.p256dh,s.auth,s.user_id,n.type,n.request_id FROM push_subscriptions s JOIN notifications n ON n.user_id=s.user_id WHERE s.id=${subscriptionId} AND n.id=${notificationId}`,
  );
  if (!data) return;
  const user = await one<
    Actor & { locked: boolean; deleted_at: Date | null; role_active: boolean }
  >(
    sql`SELECT u.*,r.active role_active,COALESCE((SELECT json_agg(p.key) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id),'[]'::json) permissions FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=${data.user_id}`,
  );
  if (
    !user ||
    user.deleted_at ||
    !user.role_active ||
    user.locked ||
    !(await one(
      sql`SELECT r.id FROM purchase_requests r WHERE r.id=${data.request_id} AND ${requestScope(user)}`,
    ))
  )
    return;
  // Preferences and mandatory policy are rechecked when delivery is attempted.
  const pref = await one<{ enabled: boolean }>(
    sql`SELECT CASE WHEN p.forced THEN p.in_app ELSE COALESCE(n.in_app,p.in_app) END enabled FROM notification_policy p LEFT JOIN notification_preferences n ON n.type=p.type AND n.user_id=${data.user_id} WHERE p.type=${data.type}`,
  );
  if (!pref?.enabled) return;
  if (!pushConfigured()) throw new Error("Push not configured");
  const {m:ar}=language(parseLocale(user.locale));
  try {
    await webpush.sendNotification(
      {
        endpoint: data.endpoint,
        keys: { p256dh: data.p256dh, auth: data.auth },
      },
      JSON.stringify({
        title: ar.nav.notifications,
        body: ar.notificationTypes[data.type],
        url: `/requests/${data.request_id}`,
        tag: notificationId,
      }),
      {
        vapidDetails: {
          subject: process.env.VAPID_SUBJECT!,
          publicKey: process.env.VAPID_PUBLIC_KEY!,
          privateKey: process.env.VAPID_PRIVATE_KEY!,
        },
        TTL: 300,
        timeout: 8000,
      },
    );
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410)
      await db().execute(
        sql`DELETE FROM push_subscriptions WHERE id=${subscriptionId}`,
      );
    else throw error;
  }
}
