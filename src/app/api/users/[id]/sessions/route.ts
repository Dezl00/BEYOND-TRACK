import { requireActor } from "@/server/auth";
import { requirePermission } from "@/server/access";
import { rows, one, sql } from "@/db";
import { uuid, cursorSchema } from "@/lib/validation";
import { decodeCursor, page } from "@/server/queries";
import { AppError, errorResponse } from "@/server/errors";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await requireActor(true),
      id = uuid.parse((await params).id),
      cursor = decodeCursor(
        cursorSchema.parse(
          new URL(req.url).searchParams.get("cursor") || undefined,
        ),
      );
    if (id !== a.id) requirePermission(a, "security.manage");
    const user = await one<{ is_owner: boolean }>(
      sql`SELECT is_owner FROM users WHERE id=${id}`,
    );
    if (!user) throw new AppError("notFound", 404);
    if (user.is_owner && id !== a.id && !a.is_owner)
      throw new AppError("owner", 403);
    return Response.json(
      page(
        await rows<{
          id: string;
          ip: string;
          user_agent: string;
          created_at: Date;
          expires_at: Date;
        }>(
          sql`SELECT id,ip,user_agent,created_at,expires_at FROM sessions WHERE user_id=${id} AND expires_at>now() ${cursor ? sql`AND id>${cursor.id}::uuid` : sql``} ORDER BY id LIMIT 26`,
        ),
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
