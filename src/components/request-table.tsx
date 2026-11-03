import Link from "next/link";
import { ArrowUpLeft } from "lucide-react";
import { ar } from "@/messages/ar";
import { date, requestCode } from "@/lib/format";
import { StatusBadge, Empty } from "./common";
import type { RecordRow } from "@/server/queries";
export default function RequestTable({
  items,
  digits = 0,
}: {
  items: RecordRow[];
  digits?: number;
}) {
  if (!items.length) return <Empty />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{ar.fields.requestNumber}</th>
            <th>{ar.common.project}</th>
            <th>{ar.fields.createdBy}</th>
            <th>{ar.fields.status}</th>
            <th>{ar.fields.expectedAt}</th>
            <th>
              <span className="sr-only">{ar.common.open}</span>
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
                  aria-label={ar.common.open}
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
