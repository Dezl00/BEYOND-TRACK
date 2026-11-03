import { requireActor } from "@/server/auth";
import { requestDetail } from "@/server/queries";
import { uuid, cursorSchema } from "@/lib/validation";
import { errorResponse } from "@/server/errors";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(),
      id = uuid.parse((await params).id),
      cursor = cursorSchema.parse(
        new URL(req.url).searchParams.get("cursor") || undefined,
      );
    return Response.json(await requestDetail(actor, id, cursor), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
