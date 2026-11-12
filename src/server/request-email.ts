import { language } from "@/messages/catalog";
import { parseLocale, type Locale } from "@/messages/types";
import { one, rows, sql } from "@/db";
import { can, canViewPrices, type Actor } from "@/lib/domain";
import { requestLink } from "@/lib/request-links";
import { requestCode } from "@/lib/format";
import { ar } from "@/messages/ar";
import { requestScope } from "./access";
import {
  requestEmail,
  type MailRequest,
  type MailLine,
  type MailQuote,
} from "./email-templates";
export async function prepareRequestEmail(
  userId: string,
  requestId: string,
  type?: number,
) {
  const actor = await one<Actor>(
    sql`SELECT u.id,u.email,u.locale,u.is_owner,COALESCE((SELECT json_agg(p.key) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id),'[]'::json) permissions FROM users u JOIN roles role ON role.id=u.role_id WHERE u.id=${userId} AND role.active AND NOT u.locked AND u.deleted_at IS NULL`,
  );
  if (!actor || !can(actor, "requests.view")) return null;
  const {m:ar,locale}=language(parseLocale(actor.locale));
  const request = await one<MailRequest>(
    sql`SELECT r.project_id,r.created_by,r.number,r.status,r.created_at,r.notes,r.expected_at,p.name project,u.name creator,s.name supplier,(SELECT NULLIF(t.note,'') FROM request_timeline t WHERE t.request_id=r.id ORDER BY t.created_at DESC,t.id DESC LIMIT 1) "lastAction" FROM purchase_requests r JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=r.created_by LEFT JOIN suppliers s ON s.id=r.supplier_id WHERE r.id=${requestId} AND ${requestScope(actor)}`,
  );
  if (!request) return null;
  const prices = canViewPrices(actor);
  const lines = await rows<MailLine>(
    sql`SELECT m.code,m.name,u.name unit,l.quantity,${prices ? sql`l.price` : sql`NULL`} price,concat_ws(' · ',NULLIF(l.notes,''),CASE WHEN l.review_status=2 THEN ${ar.interface.rejectionNote+": "}::text||l.review_note END) notes,COALESCE(rec.accepted,0) accepted,COALESCE(rec.damaged,0) damaged,COALESCE(rec.rejected,0) rejected,COALESCE(rec.returned,0) returned FROM request_lines l JOIN materials m ON m.id=l.material_id JOIN boq_items b ON b.id=m.boq_item_id JOIN units u ON u.id=COALESCE(m.unit_id,b.unit_id) LEFT JOIN LATERAL(SELECT SUM(accepted) accepted,SUM(damaged) damaged,SUM(rejected) rejected,SUM(returned) returned FROM receipt_lines WHERE request_line_id=l.id)rec ON true WHERE l.request_id=${requestId} ORDER BY m.code,m.name`,
  );
  if (prices)
    request.quotes = await rows<MailQuote>(
      sql`SELECT s.name supplier,q.expected_at,q.selected,(q.approved_by IS NOT NULL) approved,(SELECT ROUND(SUM((v->>'price')::numeric*(v->>'quantity')::numeric),2)::text FROM jsonb_array_elements(q.prices) v) total FROM request_quotes q JOIN suppliers s ON s.id=q.supplier_id JOIN purchase_requests r ON r.id=q.request_id AND r.pricing_revision=q.revision WHERE q.request_id=${requestId} ORDER BY q.selected DESC,s.name`,
    );
  const event =
    type === undefined
      ? ar.email.notificationSubject
      : ar.notificationTypes[type];
  return {
    to: actor.email,
    subject:
      event +
      " · " +
      requestCode(request.number) +
      " · " +
      ar.statuses[request.status],
    html: requestEmail(request, lines, event, requestLink(requestId), prices,locale),
  };
}
