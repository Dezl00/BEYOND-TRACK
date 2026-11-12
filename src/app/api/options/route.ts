import { requireActor } from "@/server/auth";
import { listResource, projectOptions } from "@/server/queries";
import { listQuerySchema } from "@/lib/validation";
import { errorResponse, AppError } from "@/server/errors";
import { z } from "zod";
import { reportOptions } from "@/server/reports";
export async function GET(req: Request) {
  try {
    const a = await requireActor(),
      params = new URL(req.url).searchParams;
    const resource = z
      .enum([
        "projects",
        "boq",
        "materials",
        "suppliers",
        "units",
        "users",
        "roles",
        "report-projects",
        "report-items",
      ])
      .parse(params.get("resource"));
    const q = listQuerySchema.parse(
      Object.fromEntries([...params].filter(([k]) => k !== "resource")),
    );
    const result =
      resource === "report-projects" || resource === "report-items"
        ? await reportOptions(a, resource, q)
        : await listResource(a, resource, q);
    return Response.json(result);
  } catch (e) {
    return errorResponse(e,req);
  }
}
