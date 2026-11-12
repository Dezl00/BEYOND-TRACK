import { createHash } from "node:crypto";
import { one, rows, sql } from "@/db";
import type { Actor } from "@/lib/domain";
import { requestScope } from "./access";
export async function liveSnapshot(actor: Actor, project?: string) {
  const scope = requestScope(actor);
  const [revision, items] = await Promise.all([
    one<{ stamp: string; unread: number }>(sql`SELECT
      (SELECT COALESCE(MAX(r.updated_at)::text,'')||':'||COUNT(*)::text||':'||COALESCE(SUM(r.version),0)::text FROM purchase_requests r WHERE ${scope} ${project ? sql`AND r.project_id=${project}` : sql``})||':'||
      COALESCE(MAX(n.created_at)::text,'')||':'||COALESCE(MAX(n.read_at)::text,'')||':'||COUNT(*)::text stamp,
      COUNT(*) FILTER(WHERE n.read_at IS NULL)::int unread
      FROM notifications n JOIN purchase_requests r ON r.id=n.request_id WHERE n.user_id=${actor.id} AND ${scope}`),
    rows<{
      id: string;
      type: number;
      request_id: string;
      number: string;
      read_at: Date | null;
      created_at: Date;
    }>(
      sql`SELECT n.id,n.type,n.request_id,r.number,n.read_at,n.created_at FROM notifications n JOIN purchase_requests r ON r.id=n.request_id WHERE n.user_id=${actor.id} AND ${scope} ORDER BY n.created_at DESC,n.id DESC LIMIT 6`,
    ),
  ]);
  return {
    revision: createHash("sha256")
      .update(revision?.stamp || "")
      .digest("hex"),
    unread: revision?.unread || 0,
    items,
  };
}
