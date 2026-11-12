import { fromRequest } from "@/messages/request";
import { timingSafeEqual } from "node:crypto";
import { processJobs, maintain } from "@/server/jobs";
import { ar } from "@/messages/ar";
export const maxDuration = 60;
export async function GET(req: Request) {
  const {m:ar}=fromRequest(req);
  const expected = `Bearer ${process.env.CRON_SECRET || ""}`,
    actual = req.headers.get("authorization") || "";
  if (
    !process.env.CRON_SECRET ||
    actual.length !== expected.length ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    return Response.json({ error: ar.errors.forbidden }, { status: 403 });
  try {
    const count = await processJobs(30);
    await maintain();
    return Response.json({ processed: count });
  } catch {
    return Response.json({ error: ar.errors.service }, { status: 503 });
  }
}
