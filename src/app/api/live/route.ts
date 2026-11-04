import { requireActor } from "@/server/auth";
import { liveSnapshot } from "@/server/live";
import { errorResponse } from "@/server/errors";
import { uuid } from "@/lib/validation";
export async function GET(req: Request) {
  try {
    const actor = await requireActor();
    const project = uuid
      .optional()
      .parse(new URL(req.url).searchParams.get("project") || undefined);
    const snapshot = await liveSnapshot(actor, project);
    return Response.json(snapshot, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
