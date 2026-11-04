import Link from "next/link";
import {
  Layers3,
  Boxes,
  ArrowUpRight,
  PackageCheck,
  Building2,
  ChevronLeft,
} from "lucide-react";
import { requirePageActor } from "@/server/page-auth";
import { can } from "@/lib/domain";
import { ar } from "@/messages/ar";
import { reportQuerySchema, riyadhToday } from "@/lib/reporting";
import {
  reportContext,
  consumptionPage,
  reportOverview,
  reportOptions,
} from "@/server/reports";
import { currentSettings } from "@/server/settings";
import { Empty, Pagination } from "@/components/common";
import ReportFilters from "@/components/report-filters";
import ReportCharts from "@/components/report-charts";
import {
  ConsumptionHead,
  ConsumptionRows,
} from "@/components/consumption-table";
import { date, number } from "@/lib/format";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await requirePageActor(),
    raw = await searchParams,
    q = reportQuerySchema.parse(raw);
  if (!q.project) {
    const projects = await reportOptions(actor, "report-projects", {
      q: q.q,
      cursor: q.cursor,
    });
    return (
      <>
        <ReportFilters query={q} exportable={false} />
        <section
          className="report-projects"
          aria-label={ar.reports.projectSelect}
        >
          {projects.items.length ? (
            projects.items.map((project) => (
              <Link
                key={project.id}
                href={`/reports?${new URLSearchParams({ project: project.id, ...(q.from ? { from: q.from } : {}), ...(q.to ? { to: q.to } : {}) })}`}
                className="report-project-card"
              >
                <Building2 size={26} />
                <span>
                  <b>{project.name}</b>
                  <bdi className="code muted">{project.code}</bdi>
                </span>
                <ChevronLeft size={18} />
              </Link>
            ))
          ) : (
            <Empty />
          )}
        </section>
        <Pagination next={projects.next} base="/reports" query={raw} />
      </>
    );
  }
  const query = { ...q, project: q.project };
  const [context, overview, data, settings] = await Promise.all([
    reportContext(actor, query),
    reportOverview(actor, query),
    consumptionPage(actor, query),
    currentSettings(),
  ]);
  const digits = settings?.digits || 0,
    period = !!q.from,
    asOf = q.to || riyadhToday();
  const stats = [
    { label: ar.reports.itemsCount, value: overview.items, Icon: Layers3 },
    {
      label: ar.reports.materialsCount,
      value: overview.materials,
      Icon: Boxes,
    },
    {
      label: ar.reports.overRequestedCount,
      value: overview.requested_over,
      Icon: ArrowUpRight,
    },
    {
      label: ar.reports.overReceivedCount,
      value: overview.received_over,
      Icon: PackageCheck,
    },
  ];
  return (
    <>
      <ReportFilters
        key={q.project}
        query={q}
        context={context}
        exportable={can(actor, "reports.export")}
      />
      <div className="report-meta-strip">
        <span>
          {ar.reports.cumulativeThrough}{" "}
          <bdi>{date(`${asOf}T12:00:00Z`, digits)}</bdi>
        </span>
        <span>
          {ar.reports.scope}:{" "}
          {can(actor, "requests.view_all")
            ? ar.permissionActions.view_all
            : ar.requests.my}
        </span>
        <span>
          {ar.reports.periodMovement}:{" "}
          <bdi>{number(overview.request_count, digits, 0)}</bdi>{" "}
          {ar.reports.requestCount} ·{" "}
          <bdi>{number(overview.receipt_count, digits, 0)}</bdi>{" "}
          {ar.reports.receiptCount}
        </span>
      </div>
      <div className="stats report-stats">
        {stats.map(({ label, value, Icon }) => (
          <div className="stat" key={label}>
            <div className="stat-top">
              <span>{label}</span>
              <span className="stat-icon">
                <Icon size={25} />
              </span>
            </div>
            <div className="stat-value">
              <bdi>{number(value, digits, 0)}</bdi>
            </div>
          </div>
        ))}
      </div>
      <ReportCharts overview={overview} digits={digits} />
      <section className="panel consumption-panel">
        <div className="panel-heading">
          <h2>{ar.reports.consumptionTable}</h2>
          <span className="muted">
            {ar.reports.materials}{" "}
            <bdi>{number(overview.materials, digits, 0)}</bdi>
          </span>
        </div>
        {data.items.length ? (
          <div className="table-wrap">
            <table className="consumption-table">
              <ConsumptionHead period={period} />
              <tbody>
                <ConsumptionRows
                  items={data.items}
                  digits={digits}
                  period={period}
                />
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
        <Pagination next={data.next} base="/reports" query={raw} />
      </section>
    </>
  );
}
