import { requestLanguage } from "@/server/language";
import { currentSettings } from "@/server/settings";
import Link from "next/link";
import { requirePageActor } from "@/server/page-auth";
import { requireRequest } from "@/server/access";
import { rows, one, sql } from "@/db";
import { uuid, cursorSchema } from "@/lib/validation";
import { decodeCursor, page } from "@/server/queries";

import { date, number } from "@/lib/format";
import { Heading, Pagination, Empty } from "@/components/common";
type Receipt = {
  id: string;
  name: string;
  notes: string;
  created_at: Date;
  files: { id: string; name: string }[];
  lines: {
    name: string;
    accepted: string;
    damaged: string;
    rejected: string;
    returned: string;
  }[];
};
export default async function ReceiptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { m: msg, date, number } = await requestLanguage();
  
  const a = await requirePageActor(),
    id = uuid.parse((await params).id),
    q = await searchParams,
    c = decodeCursor(cursorSchema.parse(q.cursor));
  await requireRequest(a, id);
  const settings = await currentSettings(),
    d = settings?.digits || 0;
  const data = page(
    await rows<Receipt>(
      sql`SELECT rec.id,rec.created_at,rec.notes,u.name,COALESCE((SELECT json_agg(json_build_object('id',a.id,'name',a.name) ORDER BY a.created_at) FROM attachments a WHERE a.receipt_id=rec.id),'[]'::json) files,COALESCE((SELECT json_agg(json_build_object('name',m.name,'accepted',rl.accepted,'damaged',rl.damaged,'rejected',rl.rejected,'returned',rl.returned)) FROM receipt_lines rl JOIN request_lines l ON l.id=rl.request_line_id JOIN materials m ON m.id=l.material_id WHERE rl.receipt_id=rec.id),'[]'::json) lines FROM receipts rec JOIN users u ON u.id=rec.created_by WHERE rec.request_id=${id} ${c ? sql`AND(rec.created_at,rec.id)<(${c.at}::timestamptz,${c.id}::uuid)` : sql``} ORDER BY rec.created_at DESC,rec.id DESC LIMIT 26`,
    ),
    true,
  );
  return (
    <>
      <Heading title={msg.requests.receipts}>
        <Link className="btn" href={`/requests/${id}`}>
          {msg.common.back}
        </Link>
      </Heading>
      <div className="stack">
        {data.items.length ? (
          data.items.map((rec) => (
            <section key={rec.id} className="panel">
              <div className="panel-heading">
                <h2>{rec.name}</h2>
                <span className="muted">{date(rec.created_at, d, true)}</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{msg.fields.material}</th>
                      {(
                        ["accepted", "damaged", "rejected", "returned"] as const
                      ).map((key) => (
                        <th key={key}>{msg.fields[key]}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rec.lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.name}</td>
                        {(
                          [
                            "accepted",
                            "damaged",
                            "rejected",
                            "returned",
                          ] as const
                        ).map((key) => (
                          <td key={key}>
                            <bdi>{number(l[key], d)}</bdi>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rec.files.length > 0 && (
                <div className="panel-body stack">
                  <h3>{msg.fields.attachments}</h3>
                  {rec.files.map((f) => (
                    <a
                      key={f.id}
                      className="attachment"
                      target="_blank"
                      rel="noopener noreferrer"
                      href={`/api/attachments/${f.id}`}
                    >
                      {f.name}
                    </a>
                  ))}
                </div>
              )}
              {rec.notes ? (
                <div className="panel-body muted">{rec.notes}</div>
              ) : null}
            </section>
          ))
        ) : (
          <Empty />
        )}
        <Pagination
          base={`/requests/${id}/receipts`}
          next={data.next}
          query={q}
        />
      </div>
    </>
  );
}
