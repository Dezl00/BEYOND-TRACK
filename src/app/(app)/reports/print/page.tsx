import { requirePageActor } from "@/server/page-auth";
import { requirePermission } from "@/server/access";
import {
  reportContext,
  reportOverview,
  consumptionPage,
} from "@/server/reports";
import { currentSettings } from "@/server/settings";
import {
  reportQuerySchema,
  riyadhToday,
  type ProjectReportQuery,
} from "@/lib/reporting";
import { can, type Actor } from "@/lib/domain";
import { AppError } from "@/server/errors";
import { ar } from "@/messages/ar";
import { date, number } from "@/lib/format";
import DocumentActions from "@/components/document-actions";
import { DocumentHeader } from "@/components/print-document";
import {
  ConsumptionHead,
  ConsumptionRows,
} from "@/components/consumption-table";

async function ReportPrintRows({
  actor,
  query,
  digits,
}: {
  actor: Actor;
  query: ProjectReportQuery;
  digits: number;
}) {
  const data = await consumptionPage(actor, query, 200);
  return (
    <>
      <ConsumptionRows
        items={data.items}
        digits={digits}
        period={!!query.from}
      />
      {data.next ? (
        <ReportPrintRows
          actor={actor}
          query={{ ...query, cursor: data.next }}
          digits={digits}
        />
      ) : (
        <tr hidden data-print-complete="report">
          <td colSpan={8} />
        </tr>
      )}
    </>
  );
}
export default async function ReportPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await requirePageActor();
  requirePermission(actor, "reports.export");
  const parsed = reportQuerySchema.parse(await searchParams);
  if (!parsed.project) throw new AppError("invalid");
  const query = { ...parsed, project: parsed.project, cursor: undefined };
  const [context, overview, settings] = await Promise.all([
    reportContext(actor, query),
    reportOverview(actor, query),
    currentSettings(),
  ]);
  const digits = settings?.digits || 0,
    asOf = query.to || riyadhToday(),
    at = new Date().toISOString();
  const params = new URLSearchParams();
  params.set("project", query.project);
  if (query.items.length) params.set("items", query.items.join(","));
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.q) params.set("q", query.q);
  return (
    <div className="document-preview">
      <DocumentActions back={`/reports?${params}`} sections={["report"]} />
      <article className="print-document report-document">
        <DocumentHeader
          title={ar.reports.consumptionTable}
          project={context.name}
          code={context.code}
          location={context.location}
          issuedBy={actor.name}
          at={at}
          digits={digits}
        />
        <dl className="document-metadata report-document-filters">
          <div>
            <dt>{ar.reports.period}</dt>
            <dd>
              {query.from ? (
                <bdi>{date(`${query.from}T12:00:00Z`, digits)}</bdi>
              ) : (
                ar.reports.allTime
              )}{" "}
              · {ar.reports.through}{" "}
              <bdi>{date(`${asOf}T12:00:00Z`, digits)}</bdi>
            </dd>
          </div>
          <div>
            <dt>{ar.reports.items}</dt>
            <dd>
              {context.selected.length
                ? context.selected.map((item) => item.code).join("، ")
                : ar.reports.allItems}
            </dd>
          </div>
          <div>
            <dt>{ar.reports.scope}</dt>
            <dd>
              {can(actor, "requests.view_all")
                ? ar.permissionActions.view_all
                : ar.requests.my}
            </dd>
          </div>
          {query.q ? (
            <div>
              <dt>{ar.common.search}</dt>
              <dd>{query.q}</dd>
            </div>
          ) : null}
        </dl>
        <div className="document-summary">
          <span>
            {ar.reports.itemsCount}
            <bdi>{number(overview.items, digits, 0)}</bdi>
          </span>
          <span>
            {ar.reports.materialsCount}
            <bdi>{number(overview.materials, digits, 0)}</bdi>
          </span>
          <span>
            {ar.reports.overRequestedCount}
            <bdi>{number(overview.requested_over, digits, 0)}</bdi>
          </span>
          <span>
            {ar.reports.overReceivedCount}
            <bdi>{number(overview.received_over, digits, 0)}</bdi>
          </span>
        </div>
        <h2 className="document-section-title">
          {ar.reports.cumulativeThrough}{" "}
          <bdi>{date(`${asOf}T12:00:00Z`, digits)}</bdi>
        </h2>
        <table className="document-table consumption-table">
          <ConsumptionHead period={!!query.from} />
          <tbody>
            <ReportPrintRows actor={actor} query={query} digits={digits} />
            {!overview.materials ? (
              <tr>
                <td colSpan={8}>{ar.common.empty}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <footer className="document-footer">
          <span>{ar.company}</span>
          <bdi className="code">{context.code}</bdi>
          <span>{ar.reports.title}</span>
        </footer>
      </article>
    </div>
  );
}
