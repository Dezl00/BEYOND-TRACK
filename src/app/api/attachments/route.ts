import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import type { UploadApiResponse } from "cloudinary";
import { db, sql, one } from "@/db";
import { requireActor } from "@/server/auth";
import { requireRequest, requireProject } from "@/server/access";
import { can } from "@/lib/domain";
import { uuid } from "@/lib/validation";
import { errorResponse, AppError } from "@/server/errors";
import { csrf, metadata, rateLimit } from "@/server/security";
import { cloud } from "@/server/cloudinary";
import { audit } from "@/server/events";
export async function POST(req: Request) {
  let uploaded: UploadApiResponse | undefined;
  try {
    csrf(req);
    const a = await requireActor();
    if (!can(a, "receipts.create") && !can(a, "requests.edit"))
      throw new AppError("forbidden", 403);
    await rateLimit("uploads", a.id, 40, 60);
    if (Number(req.headers.get("content-length") || 0) > 4.2 * 1024 * 1024)
      throw new AppError("file", 413);
    const form = await req.formData(),
      id = uuid.parse(form.get("requestId")),
      file = form.get("file"),
      receiptKey = form.get("receiptKey")
        ? uuid.parse(form.get("receiptKey"))
        : null;
    const r = await requireRequest(a, id);
    await requireProject(a, r.project_id, db(), true);
    if (
      receiptKey &&
      (!can(a, "receipts.create") || ![3, 4, 5].includes(r.status))
    )
      throw new AppError("transition", 409);
    if (
      !(file instanceof File) ||
      file.size > 4 * 1024 * 1024 ||
      file.size === 0
    )
      throw new AppError("file");
    const buffer = Buffer.from(await file.arrayBuffer()),
      type = await fileTypeFromBuffer(buffer);
    if (
      !type ||
      !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(
        type.mime,
      ) ||
      type.mime !== file.type
    )
      throw new AppError("file");
    const resourceType = type.mime === "application/pdf" ? "raw" : "image";
    const name =
      file.name.replace(/[\x00-\x1F\x7F/\\]/g, "").slice(0, 200) ||
      `file.${type.ext}`;
    uploaded = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloud().uploader.upload_stream(
        {
          resource_type: resourceType,
          type: "authenticated",
          asset_folder: `beyond-track/${r.project_id}`,
          public_id: `bt-${randomUUID()}${resourceType === "raw" ? ".pdf" : ""}`,
          overwrite: false,
        },
        (error, result) =>
          error
            ? reject(error)
            : result
              ? resolve(result)
              : reject(new AppError("service")),
      );
      stream.end(buffer);
    });
    const upload = uploaded,
      meta = await metadata();
    const attachmentId = await db().transaction(async (tx) => {
      const current = await requireRequest(a, id, tx, true);
      if (receiptKey && ![3, 4, 5].includes(current.status))
        throw new AppError("transition", 409);
      const count = await one<{ n: number }>(
        sql`SELECT COUNT(*)::int n FROM attachments WHERE request_id=${id} AND ${receiptKey ? sql`receipt_key=${receiptKey} AND uploaded_by=${a.id}` : sql`receipt_key IS NULL`}`,
        tx,
      );
      if ((count?.n || 0) >= 100) throw new AppError("file");
      const attachmentId = randomUUID();
      await tx.execute(
        sql`INSERT INTO attachments(id,request_id,uploaded_by,public_id,resource_type,format,name,bytes,receipt_key) VALUES (${attachmentId},${id},${a.id},${upload.public_id},${resourceType},${type.ext},${name},${file.size},${receiptKey})`,
      );
      if (!receiptKey)
        await tx.execute(
          sql`UPDATE purchase_requests SET version=version+1,updated_at=now() WHERE id=${id}`,
        );
      await audit(
        tx,
        a.id,
        meta,
        10,
        10,
        attachmentId,
        { name, bytes: file.size },
        r.project_id,
      );
      return attachmentId;
    });
    return Response.json({ id: attachmentId });
  } catch (e) {
    if (uploaded)
      try {
        await cloud().uploader.destroy(uploaded.public_id, {
          resource_type: uploaded.resource_type,
          type: "authenticated",
        });
      } catch {}
    return errorResponse(e);
  }
}
