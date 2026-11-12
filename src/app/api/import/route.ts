import { fromRequest } from "@/messages/request";
import { z } from "zod";
import { requireActor } from "@/server/auth";
import { requirePermission } from "@/server/access";
import { parseImport, importBoq, importTemplate } from "@/server/import";
import { uuid } from "@/lib/validation";
import { csrf, metadata, rateLimit } from "@/server/security";
import { errorResponse, AppError } from "@/server/errors";
export const maxDuration = 60;
export async function GET(req: Request) {
  try {
    const a = await requireActor();
    requirePermission(a, "boq.create");
    return new Response(new Uint8Array(await importTemplate(fromRequest(req).locale)), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          fromRequest(req).locale==="en" ? "attachment; filename=materials-template.xlsx" : "attachment; filename*=UTF-8''%D9%86%D9%85%D9%88%D8%B0%D8%AC-%D8%A7%D9%84%D8%A8%D9%86%D9%88%D8%AF.xlsx",
      },
    });
  } catch (e) {
    return errorResponse(e,req);
  }
}
export async function POST(req: Request) {
  try {
    csrf(req);
    const a = await requireActor();
    requirePermission(a, "boq.create");
    await rateLimit("import", a.id, 5, 600);
    if (Number(req.headers.get("content-length") || 0) > 4.2 * 1024 * 1024)
      throw new AppError("file");
    const form = await req.formData(),
      project = uuid.parse(form.get("projectId")),
      file = form.get("file");
    if (!(file instanceof File)) throw new AppError("file");
    const data = await parseImport(file);
    return Response.json(await importBoq(a, project, data, await metadata()));
  } catch (e) {
    return errorResponse(e,req);
  }
}
