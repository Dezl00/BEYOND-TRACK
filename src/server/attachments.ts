import { rows, sql, type Executor } from "@/db";
import { can, canViewPrices, type Actor } from "@/lib/domain";
import type { AttachmentPurpose } from "@/lib/attachments";
import type { RequestRow } from "./access";
import { AppError } from "./errors";

export function requireUpload(
  actor: Actor,
  request: RequestRow,
  purpose: AttachmentPurpose,
) {
  const permission =
    purpose === "payment"
      ? "accounts.approve"
      : ["quotation", "alternative"].includes(purpose)
        ? "procurement.edit"
        : purpose === "receipt"
          ? "receipts.create"
          : "requests.edit";
  if (!can(actor, permission)) throw new AppError("forbidden", 403);
  const statuses =
    purpose === "payment"
      ? [11]
      : ["quotation", "alternative"].includes(purpose)
        ? [2]
        : purpose === "receipt"
          ? [3, 4, 5]
          : [0, 1, 2, 10, 11, 12, 13, 14, 15];
  if (!statuses.includes(request.status)) throw new AppError("transition", 409);
}

export function attachmentVisibility(actor: Actor) {
  return sql`(receipt_key IS NULL OR receipt_id IS NOT NULL) AND (upload_key IS NULL OR linked_at IS NOT NULL) ${canViewPrices(actor) ? sql`` : sql`AND purpose NOT IN('quotation','alternative','payment')`}`;
}

export async function linkAttachments(
  tx: Executor,
  actor: Actor,
  request: RequestRow,
  purpose: AttachmentPurpose,
  ids: string[],
  key: string,
  revision: number,
  paymentId: string | null = null,
) {
  if (!ids.length) return;
  if (new Set(ids).size !== ids.length) throw new AppError("invalid");
  const selected = await rows<{ id: string }>(
    sql`SELECT id FROM attachments WHERE id IN(${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`,`,
    )})
    AND request_id=${request.id} AND purpose=${purpose} AND payment_id IS NULL
    AND ((uploaded_by=${actor.id} AND upload_key=${key} AND linked_at IS NULL) OR (${purpose !== "payment"} AND linked_at IS NOT NULL AND EXISTS(SELECT 1 FROM request_quotes q WHERE q.request_id=${request.id} AND q.revision=${request.pricing_revision} AND q.selected AND attachments.id=ANY(q.attachment_ids)))) FOR UPDATE`,
    tx,
  );
  if (selected.length !== ids.length)
    throw new AppError(
      purpose === "payment" ? "paymentAttachment" : "quotationAttachment",
    );
  await tx.execute(sql`UPDATE attachments SET linked_at=now(),pricing_revision=${revision},payment_id=${paymentId}
    WHERE linked_at IS NULL AND id IN(${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`,`,
    )})`);
}
