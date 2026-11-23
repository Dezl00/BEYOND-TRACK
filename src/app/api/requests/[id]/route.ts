import {
  approvalPermission,
  can,
  canApproveOverage,
  editable,
  Status,
  transitions,
} from "@/lib/domain";
import {
  printRequestHeader,
  printRequestLines,
  printAttachments,
  printReceipts,
  printHistory,
} from "@/server/request-print";
import { AppError } from "@/server/errors";
import { requireActor } from "@/server/auth";
import { requestDetail } from "@/server/queries";
import { uuid, cursorSchema } from "@/lib/validation";
import { errorResponse } from "@/server/errors";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requireActor(),
      id = uuid.parse((await params).id),
      cursor = cursorSchema.parse(
        new URL(req.url).searchParams.get("cursor") || undefined,
      );
    const part = new URL(req.url).searchParams.get("part");
    if (part) {
      switch (part) {
        case "header":
          return Response.json(await printRequestHeader(actor, id));
        case "lines":
          return Response.json(await printRequestLines(actor, id, true));
        case "attachments":
          return Response.json(await printAttachments(actor, id, cursor));
        case "receipts":
          return Response.json(await printReceipts(actor, id, cursor));
        case "history":
          return Response.json(await printHistory(actor, id, cursor));
        default:
          throw new AppError("notFound", 404);
      }
    }
    const detail = await requestDetail(actor, id, cursor);
    const { status } = detail;
    const own = actor.is_owner || actor.id === detail.created_by;
    const approve = can(actor, approvalPermission(status));
    const over = detail.lines.some(
      (line) => line.over === true && !line.overage_approved_by,
    );
    const actions = {
      edit:
        ![3, 4, 5, 6, 16].includes(status) &&
        !detail.has_payment &&
        can(actor, "requests.edit") &&
        (actor.is_owner || (own && editable(detail.submitted_at, status))),
      submit: status === 0 && own && can(actor, "requests.create"),
      approve: [5, 12, 13, 15].includes(status) && approve && !over,
      hold: status === 12 && approve,
      reject: [12, 13, 15].includes(status) && approve,
      technicalReview: status === 1 && approve && !over,
      quotations:
        status === 2 && can(actor, "procurement.edit") && approve && !over,
      approvePricing: status === 10 && approve && !over,
      returnPricing: status === 10 && approve,
      payment: status === 11 && approve && !over,
      invoice: status === Status.awaitingInvoice && approve,
      receive: [3, 4, 5].includes(status) && can(actor, "receipts.create"),
      overage:
        over &&
        [1, 2, 5, 10, 11, 12, 13, 15].includes(status) &&
        canApproveOverage(actor),
      cancel:
        !!transitions[status]?.includes(8) && can(actor, "requests.delete"),
      restore: status === 7 && own && can(actor, "requests.edit"),
    };
    return Response.json(
      { ...detail, actions },
      {
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  } catch (e) {
    return errorResponse(e, req);
  }
}
