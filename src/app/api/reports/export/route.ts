import { requireActor } from "@/server/auth";
import { requirePermission } from "@/server/access";
import { consumptionPage, reportContext } from "@/server/reports";
import { reportQuerySchema, consumption, percent } from "@/lib/reporting";
import { currentSettings } from "@/server/settings";
import { number } from "@/lib/format";
import { AppError, errorResponse } from "@/server/errors";
import { ar } from "@/messages/ar";

function csv(value: unknown) {
  let text = String(value ?? "");
  if (/^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export async function GET(request: Request) {
  try {
    const actor = await requireActor();
    requirePermission(actor, "reports.export");
    const parsed = reportQuerySchema.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.project) throw new AppError("invalid");
    const query = { ...parsed, project: parsed.project, cursor: undefined };
    const [context, settings] = await Promise.all([
      reportContext(actor, query),
      currentSettings(),
    ]);
    const digits = settings?.digits || 0;
    const encoder = new TextEncoder();
    const columns = [
      ar.printing.projectCode,
      ar.common.project,
      ar.fields.code,
      ar.printing.item,
      ar.printing.material,
      ar.fields.unit,
      ar.reports.allocated,
      ar.reports.requested,
      ar.reports.received,
      ar.reports.receivedRate,
      ar.reports.requestedOverage,
      `${ar.reports.requestedOverage} · ${ar.reports.ratio}`,
      ar.reports.receivedOverage,
      `${ar.reports.receivedOverage} · ${ar.reports.ratio}`,
      ar.reports.periodRequested,
      ar.reports.periodReceived,
      ar.fields.damaged,
      ar.fields.rejected,
      ar.fields.returned,
    ];
    let first = true,
      finished = false,
      cursor: string | undefined;
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (request.signal.aborted || finished) {
            controller.close();
            return;
          }
          const data = await consumptionPage(actor, { ...query, cursor }, 200);
          let chunk = first
            ? "\uFEFF" + columns.map(csv).join(",") + "\r\n"
            : "";
          for (const row of data.items) {
            const metric = consumption(row);
            chunk +=
              [
                context.code,
                context.name,
                row.code,
                row.boq_name,
                row.name,
                row.unit_name,
                number(row.allocated, digits),
                number(row.requested, digits),
                number(row.received, digits),
                percent(metric.receivedRate, digits),
                number(metric.requestedOverage, digits),
                percent(metric.requestedOverageRate, digits),
                number(metric.receivedOverage, digits),
                percent(metric.receivedOverageRate, digits),
                number(row.period_requested, digits),
                number(row.period_received, digits),
                number(row.damaged, digits),
                number(row.rejected, digits),
                number(row.returned, digits),
              ]
                .map(csv)
                .join(",") + "\r\n";
          }
          first = false;
          cursor = data.next || undefined;
          finished = !data.next;
          controller.enqueue(encoder.encode(chunk));
          if (finished) controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
      cancel() {
        finished = true;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="beyond-report-${context.code}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
