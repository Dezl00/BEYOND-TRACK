import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import type { UploadApiResponse } from "cloudinary";
import { db, sql, one } from "@/db";
import { requireActor } from "@/server/auth";
import { requireRequest, requireProject } from "@/server/access";
import { z } from "zod";
import { attachmentPurposes } from "@/lib/attachments";
import { requireUpload } from "@/server/attachments";
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
    await rateLimit("uploads", a.id, 40, 60);
    if (Number(req.headers.get("content-length") || 0) > 4.2 * 1024 * 1024)
      throw new AppError("file", 413);
    const form = await req.formData(),
      id = uuid.parse(form.get("requestId")),
      file = form.get("file"),
      receiptKey = form.get("receiptKey")
        ? uuid.parse(form.get("receiptKey"))
        : null;
    const purpose = z
      .enum(attachmentPurposes)
      .parse(form.get("purpose") || (receiptKey ? "receipt" : "request"));
    const uploadKey = form.get("uploadKey")
      ? uuid.parse(form.get("uploadKey"))
      : null;
    if (
      (purpose === "receipt") !== !!receiptKey ||
      (["quotation", "alternative", "payment"].includes(purpose) && !uploadKey)
    )
      throw new AppError("invalid");
    if (uploadKey && (purpose === "request" || purpose === "receipt"))
      throw new AppError("invalid");
    const r = await requireRequest(a, id);
    requireUpload(a, r, purpose);
    await requireProject(a, r.project_id, db(), true);
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
      (file.type &&
        file.type !== "application/octet-stream" &&
        type.mime !== file.type)
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
          type: "upload",
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
      requireUpload(a, current, purpose);
      const count = await one<{ n: number }>(
        sql`SELECT COUNT(*)::int n FROM attachments WHERE request_id=${id} AND purpose=${purpose} AND ${receiptKey ? sql`receipt_key=${receiptKey} AND uploaded_by=${a.id}` : uploadKey ? sql`upload_key=${uploadKey} AND uploaded_by=${a.id}` : sql`upload_key IS NULL AND receipt_key IS NULL`}`,
        tx,
      );
      if ((count?.n || 0) >= (receiptKey || uploadKey ? 20 : 100))
        throw new AppError("file");
      const attachmentId = randomUUID();
      await tx.execute(
        sql`INSERT INTO attachments(id,request_id,uploaded_by,public_id,resource_type,format,name,bytes,receipt_key,purpose,upload_key,delivery_type,cloudinary_url) VALUES (${attachmentId},${id},${a.id},${upload.public_id},${resourceType},${type.ext},${name},${file.size},${receiptKey},${purpose},${uploadKey},'upload',${upload.secure_url})`,
      );
      if (!receiptKey && !uploadKey)
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
          type: uploaded.type,
        });
      } catch {}
    return errorResponse(e,req);
  }
}
