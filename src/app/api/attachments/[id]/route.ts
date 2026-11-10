import { requireActor } from "@/server/auth";
import { one, sql } from "@/db";
import { cloud } from "@/server/cloudinary";
import { uuid } from "@/lib/validation";
import { errorResponse, AppError } from "@/server/errors";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = uuid.parse((await params).id);
    const file = await one<{
      public_id: string;
      resource_type: string;
      delivery_type: string;
      cloudinary_url: string | null;
      uploaded_by: string;
      pending: boolean;
    }>(sql`SELECT public_id,resource_type,delivery_type,cloudinary_url,uploaded_by,
      ((receipt_key IS NOT NULL AND receipt_id IS NULL) OR (upload_key IS NOT NULL AND linked_at IS NULL)) pending
      FROM attachments WHERE id=${id}`);
    if (!file) throw new AppError("notFound", 404);
    if (file.pending && (await requireActor()).id !== file.uploaded_by)
      throw new AppError("forbidden", 403);
    const url =
      file.cloudinary_url ||
      cloud().url(file.public_id, {
        resource_type: file.resource_type,
        type: file.delivery_type,
        sign_url: file.delivery_type === "authenticated",
        secure: true,
      });
    return Response.redirect(url, 302);
  } catch (error) {
    return errorResponse(error);
  }
}
