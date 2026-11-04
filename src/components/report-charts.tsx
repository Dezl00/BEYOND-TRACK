import { ar } from "@/messages/ar";
import { number } from "@/lib/format";
import { consumption, percent } from "@/lib/reporting";
import type { ReportOverview } from "@/server/reports";
import { Empty } from "./common";

export default function ReportCharts({
  overview,
  digits,
}: {
  overview: ReportOverview;
  digits: number;
}) {
  const top = overview.top.map((row) => ({ ...row, ...consumption(row) }));
  const scale = Math.max(
    100,
    ...top.flatMap((row) => [
      Number(row.requestedRate),
      Number(row.receivedRate),
    ]),
  );
  const categories = [
    {
      key: "within",
      label: ar.reports.withinLimit,
      count: overview.within_limit,
    },
    { key: "over", label: ar.reports.overLimit, count: overview.received_over },
    { key: "unused", label: ar.reports.noReceipts, count: overview.untouched },
  ];
  let offset = 0;
  const max =
    Math.ceil(
      Math.max(
        1,
        ...overview.trend.flatMap((point) => [point.requests, point.receipts]),
      ) / 2,
    ) * 2;
  const monthLabel = (month: string) =>
    new Intl.DateTimeFormat(
      digits ? "ar-SA-u-ca-gregory-nu-arab" : "ar-SA-u-ca-gregory-nu-latn",
      { month: "short", year: "numeric" },
    ).format(new Date(`${month}-15T12:00:00Z`));
  const x = (index: number) => 630 - index * (570 / 11),
    y = (count: number) => 152 - (count / max) * 120;
  return (
    <div className="report-charts">
      <section className="panel consumption-chart">
        <div className="panel-heading">
          <h2>{ar.reports.highestConsumption}</h2>
          <div className="chart-legend">
            <span className="legend-requested">
              {ar.reports.requestedLegend}
            </span>
            <span className="legend-received">{ar.reports.receivedLegend}</span>
          </div>
        </div>
        {top.length ? (
          <ol className="consumption-ranking">
            {top.map((row) => (
              <li key={row.id}>
                <div className="ranking-heading">
                  <span>
                    <b>{row.name}</b>
                    <small>
                      <bdi className="code">{row.code}</bdi> · {row.boq_name}
                    </small>
                  </span>
                  <div className="ranking-rates">
                    <bdi>{percent(row.requestedRate, digits)}</bdi>
                    <bdi>{percent(row.receivedRate, digits)}</bdi>
                  </div>
                </div>
                <div
                  className="comparison-bars"
                  role="img"
                  aria-label={`${row.name} · ${ar.reports.requestedLegend} ${percent(row.requestedRate, digits)} · ${ar.reports.receivedLegend} ${percent(row.receivedRate, digits)}`}
                >
                  <span
                    className="reference-line"
                    style={{ insetInlineStart: `${(100 / scale) * 100}%` }}
                    title={ar.reports.reference}
                  />
                  <div>
                    <i
                      className="bar-requested"
                      style={{
                        inlineSize: `${(Math.max(0, Number(row.requestedRate)) / scale) * 100}%`,
                      }}
                    />
                  </div>
                  <div>
                    <i
                      className="bar-received"
                      style={{
                        inlineSize: `${(Math.max(0, Number(row.receivedRate)) / scale) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <Empty />
        )}
        <div className="chart-reference">
          <span />
          {ar.reports.reference} <bdi>{percent(100, digits)}</bdi>
        </div>
      </section>
      <section className="panel distribution-chart">
        <div className="panel-heading">
          <h2>{ar.reports.distribution}</h2>
        </div>
        <div className="distribution-ring">
          <svg
            viewBox="0 0 120 120"
            role="img"
            aria-label={ar.reports.distribution}
          >
            <circle className="ring-track" cx="60" cy="60" r="48" />
            {categories.map((category) => {
              const length = overview.materials
                ? (category.count / overview.materials) * 100
                : 0;
              const segment = (
                <circle
                  key={category.key}
                  className={`ring-${category.key}`}
                  cx="60"
                  cy="60"
                  r="48"
                  pathLength="100"
                  strokeDasharray={`${length} ${100 - length}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 60 60)"
                />
              );
              offset += length;
              return segment;
            })}
          </svg>
          <div>
            <bdi>{number(overview.materials, digits, 0)}</bdi>
            <span>{ar.reports.materialsCount}</span>
          </div>
        </div>
        <ul className="distribution-legend">
          {categories.map((category) => (
            <li className={`legend-${category.key}`} key={category.key}>
              <span>{category.label}</span>
              <bdi>{number(category.count, digits, 0)}</bdi>
              <bdi className="muted">
                {percent(
                  overview.materials
                    ? (category.count / overview.materials) * 100
                    : 0,
                  digits,
                )}
              </bdi>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel trend-chart">
        <div className="panel-heading">
          <h2>{ar.reports.trend}</h2>
          <div className="chart-legend">
            <span className="legend-requested">{ar.reports.requestCount}</span>
            <span className="legend-received">{ar.reports.receiptCount}</span>
          </div>
        </div>
        <div className="trend-canvas">
          <svg viewBox="0 0 680 196" role="img" aria-label={ar.reports.trend}>
            {[0, 0.5, 1].map((tick) => (
              <g key={tick}>
                <line
                  className="chart-gridline"
                  x1="45"
                  x2="642"
                  y1={y(max * tick)}
                  y2={y(max * tick)}
                />
                <text x="25" y={y(max * tick) + 4} textAnchor="middle">
                  {number(max * tick, digits, 0)}
                </text>
              </g>
            ))}
            <polyline
              className="trend-requests"
              points={overview.trend
                .map((point, i) => `${x(i)},${y(point.requests)}`)
                .join(" ")}
            />
            <polyline
              className="trend-receipts"
              points={overview.trend
                .map((point, i) => `${x(i)},${y(point.receipts)}`)
                .join(" ")}
            />
            {overview.trend.map((point, i) => (
              <g key={point.month}>
                <circle
                  className="trend-request-dot"
                  cx={x(i)}
                  cy={y(point.requests)}
                  r="3"
                >
                  <title>{`${monthLabel(point.month)} · ${ar.reports.requestCount}: ${number(point.requests, digits, 0)}`}</title>
                </circle>
                <circle
                  className="trend-receipt-dot"
                  cx={x(i)}
                  cy={y(point.receipts)}
                  r="3"
                >
                  <title>{`${monthLabel(point.month)} · ${ar.reports.receiptCount}: ${number(point.receipts, digits, 0)}`}</title>
                </circle>
                <text x={x(i)} y="181" textAnchor="middle">
                  {new Intl.DateTimeFormat(
                    digits
                      ? "ar-SA-u-ca-gregory-nu-arab"
                      : "ar-SA-u-ca-gregory-nu-latn",
                    { month: "short" },
                  ).format(new Date(`${point.month}-15T12:00:00Z`))}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <table className="sr-only">
          <caption>{ar.reports.trend}</caption>
          <thead>
            <tr>
              <th>{ar.common.date}</th>
              <th>{ar.reports.requestCount}</th>
              <th>{ar.reports.receiptCount}</th>
            </tr>
          </thead>
          <tbody>
            {overview.trend.map((point) => (
              <tr key={point.month}>
                <th scope="row">{monthLabel(point.month)}</th>
                <td>{number(point.requests, digits, 0)}</td>
                <td>{number(point.receipts, digits, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
