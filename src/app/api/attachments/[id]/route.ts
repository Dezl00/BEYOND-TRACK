import { requireActor } from "@/server/auth";
import { requireRequest } from "@/server/access";
import { one, sql } from "@/db";
import { cloud } from "@/server/cloudinary";
import { uuid } from "@/lib/validation";
import { errorResponse, AppError } from "@/server/errors";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const a = await requireActor(),
      id = uuid.parse((await params).id);
    const file = await one<{
      request_id: string;
      public_id: string;
      resource_type: string;
      format: string;
      name: string;
    }>(
      sql`SELECT request_id,public_id,resource_type,format,name FROM attachments WHERE id=${id}`,
    );
    if (!file) throw new AppError("notFound", 404);
    await requireRequest(a, file.request_id);
    const url = cloud().url(file.public_id, {
      resource_type: file.resource_type,
      type: "authenticated",
      sign_url: true,
      secure: true,
      ...(file.resource_type === "image"
        ? { fetch_format: "auto", quality: "auto" }
        : {}),
    });
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new AppError("service", 502);
    return new Response(response.body, {
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'none'; sandbox; frame-ancestors 'self';",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
