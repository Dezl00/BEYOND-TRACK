import { receiptQuantityError } from "@/lib/receiving";
import type { QuotePrice } from "@/lib/quotations";
import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import type { z } from "zod";
import { db, one, rows, sql, type Executor } from "@/db";
import {
  type Actor,
  can,
  editable,
  receiptStatus,
  transitions,
} from "@/lib/domain";
import {
  requestSchema,
  transitionSchema,
  orderSchema,
  quotationsSchema,
  receiptSchema,
} from "@/lib/validation";
import {
  requirePermission,
  requireProject,
  requireRequest,
  type RequestRow,
} from "./access";
import { AppError } from "./errors";
import { audit, notify, changes, type Meta } from "./events";
type Material = {
  id: string;
  quantity: string;
  project_id: string;
  active: boolean;
};
export async function overages(id: string, conn: Executor = db()) {
  return rows<{
    id: string;
    quantity: string;
    approved: boolean;
    over: boolean;
  }>(
    sql`SELECT l.id,l.quantity,l.overage_approved_by IS NOT NULL approved,(l.quantity+COALESCE((SELECT SUM(x.quantity) FROM request_lines x JOIN purchase_requests r ON r.id=x.request_id WHERE x.material_id=l.material_id AND x.request_id<>l.request_id AND (r.status BETWEEN 1 AND 6 OR r.status IN(9,10,11))),0)>m.quantity) AS over FROM request_lines l JOIN materials m ON m.id=l.material_id WHERE l.request_id=${id}`,
    conn,
  );
}
async function ensureOverageApproved(id: string, conn: Executor) {
  if ((await overages(id, conn)).some((l) => l.over && !l.approved))
    throw new AppError("overage", 409);
}
async function history(
  conn: Executor,
  r: RequestRow,
  actor: Actor,
  status: number,
  note = "",
) {
  await conn.execute(
    sql`INSERT INTO request_timeline(request_id,user_id,from_status,to_status,note) VALUES (${r.id},${actor.id},${r.status},${status},${note})`,
  );
}
export async function saveRequest(
  actor: Actor,
  input: z.infer<typeof requestSchema>,
  meta: Meta,
) {
  requirePermission(actor, input.id ? "requests.edit" : "requests.create");
  return db().transaction(async (tx) => {
    await requireProject(actor, input.projectId, tx, true);
    let existing: RequestRow | undefined;
    if (input.id) {
      existing = await requireRequest(actor, input.id, tx, true);
      if (existing.project_id !== input.projectId)
        throw new AppError("invalid");
      if (existing.version !== input.version)
        throw new AppError("conflict", 409);
      if (
        !actor.is_owner &&
        (existing.created_by !== actor.id ||
          !editable(existing.submitted_at, existing.status))
      )
        throw new AppError("editExpired", 403);
    }
    const ids = input.lines.map((l) => l.materialId).sort();
    const materials = await rows<Material>(
      sql`SELECT m.id,m.quantity,m.active,b.project_id FROM materials m JOIN boq_items b ON b.id=m.boq_item_id WHERE m.id IN (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`,`,
      )}) AND b.level=3 AND b.active=true AND EXISTS(SELECT 1 FROM units un WHERE un.id=b.unit_id AND un.active=true) AND NOT EXISTS(SELECT 1 FROM boq_items pa LEFT JOIN boq_items grand ON grand.id=pa.parent_id WHERE pa.id=b.parent_id AND (pa.active=false OR grand.active=false)) ORDER BY m.id FOR UPDATE OF m`,
      tx,
    );
    if (
      materials.length !== ids.length ||
      materials.some((m) => m.project_id !== input.projectId || !m.active)
    )
      throw new AppError("invalid");
    const id = existing?.id || randomUUID();
    const oldLines = existing
      ? await rows<{
          id: string;
          material_id: string;
          quantity: string;
          notes: string;
          price: string | null;
        }>(sql`SELECT * FROM request_lines WHERE request_id=${id}`, tx)
      : [];
    const withReceipts = existing
      ? await rows<{ request_line_id: string; net: string }>(
          sql`SELECT rl.request_line_id,SUM(rl.accepted-rl.returned)::text net FROM receipt_lines rl JOIN request_lines l ON l.id=rl.request_line_id WHERE l.request_id=${id} GROUP BY rl.request_line_id`,
          tx,
        )
      : [];
    for (const old of oldLines) {
      const next = input.lines.find((l) => l.materialId === old.material_id),
        received = withReceipts.find((l) => l.request_line_id === old.id);
      if (received && (!next || new Decimal(next.quantity).lt(received.net)))
        throw new AppError("quantity", 409);
    }
    let status = existing?.status || 0;
    if (input.submit && status === 0) status = 1;
    // Pricing is invalidated when the composition changes after an order. Receipts remain immutable.
    if (
      existing &&
      status !== 0 &&
      ![6, 7, 8].includes(status) &&
      (input.lines.length !== oldLines.length ||
        input.lines.some(
          (l) =>
            !oldLines.some(
              (old) =>
                old.material_id === l.materialId &&
                new Decimal(old.quantity).eq(l.quantity),
            ),
        ))
    )
      status = 1;
    if (existing && status === 1 && existing.status !== 0) {
      await tx.execute(
        sql`UPDATE purchase_requests SET pricing_revision=pricing_revision+1,supplier_id=null,expected_at=null WHERE id=${id}`,
      );
      await tx.execute(
        sql`UPDATE request_lines SET price=null WHERE request_id=${id}`,
      );
    }
    if (existing)
      await tx.execute(
        sql`UPDATE purchase_requests SET notes=${input.notes},status=${status},submitted_at=CASE WHEN submitted_at IS NULL AND ${input.submit} THEN now() ELSE submitted_at END,updated_at=now(),version=version+1 WHERE id=${id}`,
      );
    else
      await tx.execute(
        sql`INSERT INTO purchase_requests(id,project_id,created_by,notes,status,submitted_at) VALUES (${id},${input.projectId},${actor.id},${input.notes},${status},${input.submit ? new Date() : null})`,
      );
    for (const old of oldLines.filter((l) => !ids.includes(l.material_id)))
      await tx.execute(sql`DELETE FROM request_lines WHERE id=${old.id}`);
    for (const line of input.lines) {
      const old = oldLines.find((l) => l.material_id === line.materialId);
      if (old)
        await tx.execute(
          sql`UPDATE request_lines SET quantity=${line.quantity},notes=${line.notes},overage_approved_by=CASE WHEN quantity<>${line.quantity}::numeric THEN null ELSE overage_approved_by END,overage_approved_at=CASE WHEN quantity<>${line.quantity}::numeric THEN null ELSE overage_approved_at END WHERE id=${old.id}`,
        );
      else
        await tx.execute(
          sql`INSERT INTO request_lines(request_id,material_id,quantity,notes) VALUES (${id},${line.materialId},${line.quantity},${line.notes})`,
        );
    }
    if (!existing || status !== existing.status)
      await tx.execute(
        sql`INSERT INTO request_timeline(request_id,user_id,from_status,to_status) VALUES (${id},${actor.id},${existing?.status ?? null},${status})`,
      );
    await audit(
      tx,
      actor.id,
      meta,
      existing ? 1 : 0,
      4,
      id,
      changes(
        {
          notes: existing?.notes,
          lines: oldLines.map((l) => ({
            materialId: l.material_id,
            quantity: String(l.quantity),
            notes: l.notes,
          })),
        },
        { notes: input.notes, lines: input.lines },
      ),
      input.projectId,
    );
    if (status !== 0) await notify(tx, id, existing ? 1 : 0, actor.id);
    return { id };
  });
}
export async function transitionRequest(
  actor: Actor,
  input: z.infer<typeof transitionSchema>,
  meta: Meta,
) {
  return db().transaction(async (tx) => {
    const r = await requireRequest(actor, input.id, tx, true);
    await requireProject(actor, r.project_id, tx, true);
    if (r.version !== input.version) throw new AppError("conflict", 409);
    if (!transitions[r.status]?.includes(input.status))
      throw new AppError("transition", 409);
    if (input.status === 2 && ![9, 10].includes(r.status))
      throw new AppError("transition", 409);
    if (input.status === 9 && r.status !== 1)
      throw new AppError("transition", 409);
    if ([3, 4, 5, 10].includes(input.status))
      throw new AppError("transition", 409); // Derived by order/receipt services, including owner actions.
    if (input.status === 1) {
      requirePermission(actor, "requests.create");
      if (r.created_by !== actor.id && !actor.is_owner)
        throw new AppError("forbidden", 403);
    } else if (input.status === 8) {
      requirePermission(actor, "requests.delete");
      if (
        (
          await one<{ n: string }>(
            sql`SELECT COUNT(*)::text n FROM receipts WHERE request_id=${r.id}`,
            tx,
          )
        )?.n !== "0"
      )
        throw new AppError("referenced", 409);
    } else if (input.status === 0) requirePermission(actor, "requests.edit");
    else if (input.status === 9 || (input.status === 7 && r.status === 1))
      requirePermission(actor, "technical.approve");
    else if (
      (input.status === 2 && [9, 10].includes(r.status)) ||
      (input.status === 11 && r.status === 10) ||
      (input.status === 7 && [9, 10].includes(r.status))
    )
      requirePermission(actor, "finance.approve");
    else requirePermission(actor, "procurement.approve");
    if (
      ([7, 8].includes(input.status) ||
        (r.status === 10 && input.status === 2)) &&
      !input.reason
    )
      throw new AppError("required");
    if (input.status === 11) {
      const quote = await selectedQuote(r, tx);
      await tx.execute(
        sql`UPDATE request_quotes SET approved_by=${actor.id},approved_at=now() WHERE id=${quote.id}`,
      );
    }
    if (
      [6, 9, 11].includes(input.status) ||
      (input.status === 2 && r.status === 9)
    )
      await ensureOverageApproved(r.id, tx);
    await tx.execute(
      sql`UPDATE purchase_requests SET status=${input.status},version=version+1,updated_at=now(),submitted_at=CASE WHEN ${input.status}=1 THEN now() WHEN ${input.status}=0 THEN null ELSE submitted_at END WHERE id=${r.id}`,
    );
    await history(tx, r, actor, input.status, input.reason);
    await audit(
      tx,
      actor.id,
      meta,
      3,
      4,
      r.id,
      {
        status: { before: r.status, after: input.status },
        reason: input.reason,
      },
      r.project_id,
    );
    await notify(tx, r.id, 1, actor.id);
    return { id: r.id };
  });
}
export async function approveOverage(actor: Actor, id: string, meta: Meta) {
  requirePermission(actor, "requests.approve");
  return db().transaction(async (tx) => {
    const r = await requireRequest(actor, id, tx, true);
    await requireProject(actor, r.project_id, tx, true);
    if (![1, 2, 5, 9, 10, 11].includes(r.status))
      throw new AppError("transition", 409);
    const lines = (await overages(id, tx)).filter((l) => l.over && !l.approved);
    if (!lines.length) throw new AppError("conflict", 409);
    await tx.execute(
      sql`UPDATE request_lines SET overage_approved_by=${actor.id},overage_approved_at=now() WHERE id IN (${sql.join(
        lines.map((l) => sql`${l.id}::uuid`),
        sql`,`,
      )})`,
    );
    await tx.execute(
      sql`UPDATE purchase_requests SET version=version+1,updated_at=now() WHERE id=${id}`,
    );
    await audit(
      tx,
      actor.id,
      meta,
      11,
      4,
      id,
      { approvedLines: lines.map((l) => ({ id: l.id, quantity: l.quantity })) },
      r.project_id,
    );
    return { id };
  });
}
async function selectedQuote(r: RequestRow, tx: Executor) {
  const quote = await one<{
    id: string;
    supplier_id: string;
    expected_at: string;
    prices: QuotePrice[];
    approved_by: string | null;
  }>(
    sql`SELECT q.* FROM request_quotes q JOIN suppliers s ON s.id=q.supplier_id AND s.active=true WHERE q.request_id=${r.id} AND q.revision=${r.pricing_revision} AND q.selected=true`,
    tx,
  );
  if (!quote) throw new AppError("pricingRequired", 409);
  const lines = await rows<{ id: string; quantity: string }>(
    sql`SELECT id,quantity FROM request_lines WHERE request_id=${r.id}`,
    tx,
  );
  if (
    lines.length !== quote.prices.length ||
    lines.some(
      (l) =>
        !quote.prices.some(
          (p) => p.id === l.id && new Decimal(p.quantity).eq(l.quantity),
        ),
    )
  )
    throw new AppError("pricingRequired", 409);
  return quote;
}
export async function submitQuotations(
  actor: Actor,
  input: z.infer<typeof quotationsSchema>,
  meta: Meta,
) {
  requirePermission(actor, "procurement.edit");
  requirePermission(actor, "procurement.approve");
  return db().transaction(async (tx) => {
    const r = await requireRequest(actor, input.id, tx, true);
    await requireProject(actor, r.project_id, tx, true);
    if (r.version !== input.version) throw new AppError("conflict", 409);
    if (![2, 10, 11].includes(r.status)) throw new AppError("transition", 409);
    if (
      input.selectedIndex < 0 ||
      input.selectedIndex >= input.offers.length ||
      new Set(input.offers.map((o) => o.supplierId)).size !==
        input.offers.length
    )
      throw new AppError("quoteSuppliers");
    await ensureOverageApproved(r.id, tx);
    const lines = await rows<{ id: string; quantity: string }>(
      sql`SELECT id,quantity FROM request_lines WHERE request_id=${r.id}`,
      tx,
    );
    const revision = r.pricing_revision + 1;
    for (const [index, offer] of input.offers.entries()) {
      if (
        offer.prices.length !== lines.length ||
        new Set(offer.prices.map((p) => p.id)).size !== lines.length ||
        offer.prices.some((p) => !lines.some((l) => l.id === p.id))
      )
        throw new AppError("invalid");
      if (
        !(await one(
          sql`SELECT id FROM suppliers WHERE id=${offer.supplierId} AND active=true`,
          tx,
        ))
      )
        throw new AppError("invalid");
      const prices = offer.prices.map((p) => ({
        ...p,
        quantity: String(lines.find((l) => l.id === p.id)!.quantity),
      }));
      await tx.execute(
        sql`INSERT INTO request_quotes(request_id,revision,supplier_id,expected_at,prices,selected,created_by) VALUES(${r.id},${revision},${offer.supplierId},${offer.expectedAt},${JSON.stringify(prices)}::jsonb,${index === input.selectedIndex},${actor.id})`,
      );
    }
    await tx.execute(
      sql`UPDATE purchase_requests SET status=10,pricing_revision=${revision},version=version+1,updated_at=now() WHERE id=${r.id}`,
    );
    await history(tx, r, actor, 10);
    await audit(
      tx,
      actor.id,
      meta,
      3,
      4,
      r.id,
      {
        status: { before: r.status, after: 10 },
        revision,
        offers: input.offers,
        selectedIndex: input.selectedIndex,
      },
      r.project_id,
    );
    await notify(tx, r.id, 1, actor.id);
    return { id: r.id };
  });
}
export async function placeOrder(
  actor: Actor,
  input: z.infer<typeof orderSchema>,
  meta: Meta,
) {
  requirePermission(actor, "procurement.edit");
  requirePermission(actor, "procurement.approve");
  return db().transaction(async (tx) => {
    const r = await requireRequest(actor, input.id, tx, true);
    await requireProject(actor, r.project_id, tx, true);
    if (r.version !== input.version) throw new AppError("conflict", 409);
    if (r.status !== 11) throw new AppError("pricingRequired", 409);
    const quote = await selectedQuote(r, tx);
    if (!quote.approved_by) throw new AppError("pricingRequired", 409);
    await ensureOverageApproved(r.id, tx);
    for (const p of quote.prices)
      await tx.execute(
        sql`UPDATE request_lines SET price=${p.price} WHERE id=${p.id}`,
      );
    const quantities = await rows<{
      quantity: string;
      accepted: string;
      returned: string;
    }>(
      sql`SELECT l.quantity,COALESCE(SUM(rl.accepted),0)::text accepted,COALESCE(SUM(rl.returned),0)::text returned FROM request_lines l LEFT JOIN receipt_lines rl ON rl.request_line_id=l.id WHERE l.request_id=${r.id} GROUP BY l.id`,
      tx,
    );
    const status = receiptStatus(quantities);
    await tx.execute(
      sql`UPDATE purchase_requests SET supplier_id=${quote.supplier_id},expected_at=${quote.expected_at},status=${status},version=version+1,updated_at=now() WHERE id=${r.id}`,
    );
    await history(tx, r, actor, status);
    await audit(
      tx,
      actor.id,
      meta,
      3,
      4,
      r.id,
      { status: { before: r.status, after: status }, quoteId: quote.id },
      r.project_id,
    );
    await notify(tx, r.id, 1, actor.id);
    return { id: r.id };
  });
}
export async function receive(
  actor: Actor,
  input: z.infer<typeof receiptSchema>,
  meta: Meta,
) {
  requirePermission(actor, "receipts.create");
  return db().transaction(async (tx) => {
    const r = await requireRequest(actor, input.requestId, tx, true);
    await requireProject(actor, r.project_id, tx, true);
    const duplicate = await one<{
      id: string;
      request_id: string;
      created_by: string;
    }>(
      sql`SELECT id,request_id,created_by FROM receipts WHERE idempotency_key=${input.key}`,
      tx,
    );
    if (duplicate) {
      if (duplicate.request_id !== r.id || duplicate.created_by !== actor.id)
        throw new AppError("conflict", 409);
      return { id: duplicate.id, requestId: r.id };
    }
    if (![3, 4, 5].includes(r.status)) throw new AppError("transition", 409);
    const lines = await rows<{
      id: string;
      quantity: string;
      accepted: string;
      returned: string;
    }>(
      sql`SELECT l.id,l.quantity,COALESCE(SUM(rl.accepted),0)::text accepted,COALESCE(SUM(rl.returned),0)::text returned FROM request_lines l LEFT JOIN receipt_lines rl ON rl.request_line_id=l.id WHERE l.request_id=${r.id} GROUP BY l.id`,
      tx,
    );
    for (const l of input.lines) {
      const previous = lines.find((p) => p.id === l.lineId);
      if (!previous) throw new AppError("invalid");
      const quantityError = receiptQuantityError(
        previous.quantity,
        previous.accepted,
        previous.returned,
        l,
      );
      if (quantityError) throw new AppError(quantityError, 409);
      previous.accepted = new Decimal(previous.accepted)
        .plus(l.accepted)
        .toString();
      previous.returned = new Decimal(previous.returned)
        .plus(l.returned)
        .toString();
    }
    if (
      !input.attachmentIds?.length ||
      new Set(input.attachmentIds).size !== input.attachmentIds.length
    )
      throw new AppError("receiptAttachments");
    const files = await rows<{ id: string }>(
      sql`SELECT id FROM attachments WHERE id IN (${sql.join(
        input.attachmentIds.map((id) => sql`${id}::uuid`),
        sql`,`,
      )}) AND request_id=${r.id} AND uploaded_by=${actor.id} AND receipt_key=${input.key} AND receipt_id IS NULL FOR UPDATE`,
      tx,
    );
    if (files.length !== input.attachmentIds.length)
      throw new AppError("receiptAttachments");
    const id = randomUUID();
    await tx.execute(
      sql`INSERT INTO receipts(id,request_id,created_by,idempotency_key,notes) VALUES (${id},${r.id},${actor.id},${input.key},${input.notes})`,
    );
    for (const l of input.lines)
      await tx.execute(
        sql`INSERT INTO receipt_lines(receipt_id,request_line_id,accepted,damaged,rejected,returned) VALUES (${id},${l.lineId},${l.accepted},${l.damaged},${l.rejected},${l.returned})`,
      );
    await tx.execute(
      sql`UPDATE attachments SET receipt_id=${id} WHERE id IN (${sql.join(
        input.attachmentIds.map((fileId) => sql`${fileId}::uuid`),
        sql`,`,
      )})`,
    );
    const status = receiptStatus(lines);
    await tx.execute(
      sql`UPDATE purchase_requests SET status=${status},version=version+1,updated_at=now() WHERE id=${r.id}`,
    );
    await history(tx, r, actor, status, input.notes);
    await audit(
      tx,
      actor.id,
      meta,
      9,
      5,
      id,
      { lines: input.lines, status: { before: r.status, after: status } },
      r.project_id,
    );
    await notify(tx, r.id, 2, actor.id);
    return { id, requestId: r.id };
  });
}
