import { Fragment } from "react";
import { ar } from "@/messages/ar";
import { number } from "@/lib/format";
import { consumption, percent, type ConsumptionRow } from "@/lib/reporting";

export function ConsumptionHead({ period }: { period: boolean }) {
  return (
    <thead>
      <tr>
        <th>{ar.printing.material}</th>
        <th>{ar.fields.unit}</th>
        <th>{ar.reports.allocated}</th>
        <th>
          {ar.reports.requested}
          {period ? <small>{ar.reports.periodRequested}</small> : null}
        </th>
        <th>
          {ar.reports.received}
          {period ? <small>{ar.reports.periodReceived}</small> : null}
        </th>
        <th>{ar.reports.receivedRate}</th>
        <th>{ar.reports.requestedOverage}</th>
        <th>{ar.reports.receivedOverage}</th>
      </tr>
    </thead>
  );
}
export function ConsumptionRows({
  items,
  digits,
  period,
}: {
  items: ConsumptionRow[];
  digits: number;
  period: boolean;
}) {
  return (
    <>
      {items.map((row, index) => {
        const metrics = consumption(row);
        return (
          <Fragment key={row.id}>
            {index === 0 || items[index - 1].boq_id !== row.boq_id ? (
              <tr className="report-group">
                <th colSpan={8} scope="rowgroup">
                  <bdi className="code">{row.code}</bdi>
                  <span>{row.boq_name}</span>
                </th>
              </tr>
            ) : null}
            <tr>
              <td className="wrap material-cell">
                <span className="cell-title">{row.name}</span>
              </td>
              <td>{row.unit_name}</td>
              <td className="numeric">
                <bdi>{number(row.allocated, digits)}</bdi>
              </td>
              <td className="numeric">
                <bdi>{number(row.requested, digits)}</bdi>
                {period ? (
                  <small>
                    <bdi>{number(row.period_requested, digits)}</bdi>
                  </small>
                ) : null}
              </td>
              <td className="numeric">
                <bdi>{number(row.received, digits)}</bdi>
                {period ? (
                  <small>
                    <bdi>{number(row.period_received, digits)}</bdi>
                  </small>
                ) : null}
              </td>
              <td className="numeric">
                <bdi
                  className={
                    Number(metrics.receivedRate) > 100 ? "quantity-over" : ""
                  }
                >
                  {percent(metrics.receivedRate, digits)}
                </bdi>
                <span className="consumption-meter" aria-hidden="true">
                  <i
                    style={{
                      inlineSize: `${Math.min(100, Math.max(0, Number(metrics.receivedRate)))}%`,
                    }}
                  />
                </span>
              </td>
              <OverageCell
                quantity={metrics.requestedOverage}
                ratio={metrics.requestedOverageRate}
                digits={digits}
              />
              <OverageCell
                quantity={metrics.receivedOverage}
                ratio={metrics.receivedOverageRate}
                digits={digits}
              />
            </tr>
          </Fragment>
        );
      })}
    </>
  );
}
function OverageCell({
  quantity,
  ratio,
  digits,
}: {
  quantity: string;
  ratio: string;
  digits: number;
}) {
  return (
    <td
      className={`numeric ${Number(quantity) > 0 ? "quantity-over" : "muted"}`}
    >
      <bdi>{number(quantity, digits)}</bdi>
      <small>
        <bdi>{percent(ratio, digits)}</bdi>
      </small>
    </td>
  );
}
