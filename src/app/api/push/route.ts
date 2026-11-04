import { z } from "zod";
import { db, one, sql } from "@/db";
import { requireActor } from "@/server/auth";
import { csrf, rateLimit } from "@/server/security";
import { errorResponse, AppError } from "@/server/errors";
import { pushConfigured } from "@/server/push";
// Restrict destinations to browser-vendor push services; arbitrary URLs could
// otherwise turn the delivery worker into an SSRF proxy.
const endpoint = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.port &&
      !url.username &&
      !url.password &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname.endsWith(".push.apple.com") ||
        url.hostname === "web.push.apple.com" ||
        url.hostname === "wns2-db5p.notify.windows.com" ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  });
const subscription = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]{86,90}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{20,30}$/),
  }),
});
export async function GET() {
  try {
    await requireActor();
    return Response.json({
      publicKey: pushConfigured() ? process.env.VAPID_PUBLIC_KEY : null,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(req: Request) {
  try {
    csrf(req);
    const actor = await requireActor();
    await rateLimit("push", actor.id, 20, 60);
    if (!pushConfigured()) throw new AppError("configured", 503);
    const value = subscription.parse(await req.json());
    const count = await one<{ n: number }>(
      sql`SELECT COUNT(*)::int n FROM push_subscriptions WHERE user_id=${actor.id}`,
    );
    if (
      (count?.n || 0) >= 10 &&
      !(await one(
        sql`SELECT id FROM push_subscriptions WHERE endpoint=${value.endpoint} AND user_id=${actor.id}`,
      ))
    )
      throw new AppError("rate", 429);
    await db().execute(
      sql`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES (${actor.id},${value.endpoint},${value.keys.p256dh},${value.keys.auth}) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth`,
    );
    return Response.json({});
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(req: Request) {
  try {
    csrf(req);
    const actor = await requireActor();
    const value = z.object({ endpoint }).parse(await req.json());
    await db().execute(
      sql`DELETE FROM push_subscriptions WHERE user_id=${actor.id} AND endpoint=${value.endpoint}`,
    );
    return Response.json({});
  } catch (e) {
    return errorResponse(e);
  }
}
