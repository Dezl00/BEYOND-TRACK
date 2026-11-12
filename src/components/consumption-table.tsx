import { requestLanguage } from "@/server/language";
import { Fragment } from "react";

import { number } from "@/lib/format";
import { consumption, percent, type ConsumptionRow } from "@/lib/reporting";

export async function ConsumptionHead({ period }: { period: boolean }) {
  const { m: msg } = await requestLanguage();
  
  return (
    <thead>
      <tr>
        <th>{msg.printing.material}</th>
        <th>{msg.fields.unit}</th>
        <th>{msg.reports.allocated}</th>
        <th>
          {msg.reports.requested}
          {period ? <small>{msg.reports.periodRequested}</small> : null}
        </th>
        <th>
          {msg.reports.received}
          {period ? <small>{msg.reports.periodReceived}</small> : null}
        </th>
        <th>{msg.reports.receivedRate}</th>
        <th>{msg.reports.requestedOverage}</th>
        <th>{msg.reports.receivedOverage}</th>
      </tr>
    </thead>
  );
}
export async function ConsumptionRows({
  items,
  digits,
  period,
}: {
  items: ConsumptionRow[];
  digits: number;
  period: boolean;
}) {
  const { number, percent, unit } = await requestLanguage();
  
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
              <td>{unit(row.unit_name)}</td>
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
async function OverageCell({
  quantity,
  ratio,
  digits,
}: {
  quantity: string;
  ratio: string;
  digits: number;
}) {
  const { number, percent } = await requestLanguage();
  
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
