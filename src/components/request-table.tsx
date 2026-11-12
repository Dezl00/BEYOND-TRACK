import { requestLanguage } from "@/server/language";
import Link from "next/link";
import { ArrowUpLeft } from "lucide-react";

import { date, requestCode } from "@/lib/format";
import { StatusBadge, Empty } from "./common";
import type { RecordRow } from "@/server/queries";
export default async function RequestTable({
  items,
  digits = 0,
}: {
  items: RecordRow[];
  digits?: number;
}) {
  const { m: msg, date } = await requestLanguage();
  
  if (!items.length) return <Empty />;
  return (
    <div className="table-wrap" id="request-results">
      <table>
        <thead>
          <tr>
            <th>{msg.fields.requestNumber}</th>
            <th>{msg.common.project}</th>
            <th>{msg.fields.createdBy}</th>
            <th>{msg.fields.status}</th>
            <th>{msg.fields.expectedAt}</th>
            <th>
              <span className="sr-only">{msg.common.open}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>
                <Link className="cell-title code" href={`/requests/${r.id}`}>
                  {requestCode(String(r.number))}
                </Link>
                <span className="cell-sub">
                  {date(String(r.created_at), digits)}
                </span>
              </td>
              <td>{String(r.project_name)}</td>
              <td>{String(r.created_by_name)}</td>
              <td>
                <StatusBadge status={Number(r.status)} />
              </td>
              <td>
                {r.expected_at ? (
                  <bdi>{date(String(r.expected_at), digits)}</bdi>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <Link
                  href={`/requests/${r.id}`}
                  className="btn icon small"
                  aria-label={msg.common.open}
                >
                  <ArrowUpLeft size={16} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
