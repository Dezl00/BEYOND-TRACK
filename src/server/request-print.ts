import { sql, rows, one } from "@/db";
import { canViewPrices, can, type Actor } from "@/lib/domain";
import { requireRequest } from "./access";
import { page, decodeCursor } from "./queries";

export async function printRequestHeader(actor: Actor, id: string) {
  const request = await requireRequest(actor, id);
  const detail = await one<{
    project_name: string;
    project_code: string;
    location: string;
    created_by_name: string;
    supplier_name: string | null;
  }>(sql`
    SELECT p.name project_name,p.code project_code,p.location,u.name created_by_name,s.name supplier_name
    FROM purchase_requests r JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=r.created_by
    LEFT JOIN suppliers s ON s.id=r.supplier_id WHERE r.id=${id}::uuid`);
  return { ...request, ...detail! };
}
export type RequestPrintLine = {
  id: string;
  code: string;
  boq_name: string;
  material_name: string;
  unit_name: string;
  quantity: string;
  notes: string;
  price: string | null;
  received: string;
};
export async function printRequestLines(
  actor: Actor,
  id: string,
  prices: boolean,
) {
  await requireRequest(actor, id);
  return rows<RequestPrintLine>(sql`SELECT l.id,b.code,b.name boq_name,m.name material_name,un.name unit_name,
    l.quantity::text,l.notes,${prices && canViewPrices(actor) ? sql`l.price::text` : sql`null`} price,
    COALESCE(rec.received,0)::text received
    FROM request_lines l JOIN materials m ON m.id=l.material_id JOIN boq_items b ON b.id=m.boq_item_id
    JOIN units un ON un.id=COALESCE(m.unit_id,b.unit_id) LEFT JOIN LATERAL (
      SELECT SUM(accepted-returned) received FROM receipt_lines WHERE request_line_id=l.id
    ) rec ON true WHERE l.request_id=${id}::uuid ORDER BY b.code,b.id,m.name,l.id LIMIT 100`);
}
export type ReceiptPrintLine = {
  id: string;
  code: string;
  boq_name: string;
  name: string;
  unit_name: string;
  accepted: string;
  damaged: string;
  rejected: string;
  returned: string;
};
export type ReceiptPrintRow = {
  id: string;
  created_at: Date;
  notes: string;
  received_by: string;
  lines: ReceiptPrintLine[];
};
export type HistoryPrintRow = {
  id: string;
  created_at: Date;
  user_name: string;
  from_status: number | null;
  to_status: number;
  note: string;
};
export type AttachmentPrintRow = {
  id: string;
  created_at: Date;
  name: string;
  format: string;
  receipt_id: string | null;
};
export async function printReceipts(actor: Actor, id: string, cursor?: string) {
  await requireRequest(actor, id);
  const c = decodeCursor(cursor);
  return page(
    await rows<ReceiptPrintRow>(sql`WITH batch AS (
    SELECT c.id,c.created_at,c.notes,u.name received_by FROM receipts c JOIN users u ON u.id=c.created_by
    WHERE c.request_id=${id}::uuid ${c ? sql`AND (c.created_at,c.id)>(${c.at}::timestamptz,${c.id}::uuid)` : sql``}
    ORDER BY c.created_at,c.id LIMIT 26
  ) SELECT b.*,COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',l.id,'code',bi.code,'boq_name',bi.name,'name',m.name,'unit_name',un.name,
      'accepted',rl.accepted::text,'damaged',rl.damaged::text,'rejected',rl.rejected::text,'returned',rl.returned::text
    ) ORDER BY bi.code,bi.id,m.name,l.id)
    FROM receipt_lines rl JOIN request_lines l ON l.id=rl.request_line_id
    JOIN materials m ON m.id=l.material_id JOIN boq_items bi ON bi.id=m.boq_item_id JOIN units un ON un.id=COALESCE(m.unit_id,bi.unit_id)
    WHERE rl.receipt_id=b.id),'[]'::jsonb) lines FROM batch b ORDER BY b.created_at,b.id`),
    true,
  );
}
export async function printHistory(actor: Actor, id: string, cursor?: string) {
  await requireRequest(actor, id);
  const c = decodeCursor(cursor);
  return page(
    await rows<HistoryPrintRow>(sql`SELECT t.id,t.created_at,t.from_status,t.to_status,t.note,u.name user_name
    FROM request_timeline t JOIN users u ON u.id=t.user_id WHERE t.request_id=${id}::uuid
    ${c ? sql`AND(t.created_at,t.id)>(${c.at}::timestamptz,${c.id}::uuid)` : sql``}
    ORDER BY t.created_at,t.id LIMIT 26`),
    true,
  );
}
export async function printAttachments(
  actor: Actor,
  id: string,
  cursor?: string,
) {
  await requireRequest(actor, id);
  const c = decodeCursor(cursor);
  return page(
    await rows<AttachmentPrintRow>(sql`SELECT id,name,format,created_at,receipt_id FROM attachments WHERE request_id=${id}::uuid AND (receipt_key IS NULL OR receipt_id IS NOT NULL)
    ${c ? sql`AND(created_at,id)>(${c.at}::timestamptz,${c.id}::uuid)` : sql``}
    ORDER BY created_at,id LIMIT 26`),
    true,
  );
}
