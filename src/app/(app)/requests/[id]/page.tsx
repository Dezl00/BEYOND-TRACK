import { currentSettings } from "@/server/settings";
import Link from "next/link";
import { Pencil, FileText, ChevronRight } from "lucide-react";
import { requirePageActor } from "@/server/page-auth";
import { requestDetail } from "@/server/queries";
import { uuid, cursorSchema } from "@/lib/validation";
import { can, editable } from "@/lib/domain";
import { date, number, requestCode } from "@/lib/format";
import { ar } from "@/messages/ar";
import { one, sql } from "@/db";
import {
  Heading,
  StatusBadge,
  Empty,
  Pagination,
  Riyal,
} from "@/components/common";
import { RequestActions, AttachmentUpload } from "@/components/request-actions";
import { Print } from "@/components/simple-actions";
export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const a = await requirePageActor(),
    id = uuid.parse((await params).id),
    raw = await searchParams,
    cursor = cursorSchema.parse(raw.cursor),
    r = await requestDetail(a, id, cursor),
    settings = await currentSettings(),
    d = settings?.digits || 0,
    pricing = can(a, "procurement.view");
  return (
    <>
      <Heading
        title={requestCode(r.number)}
        eyebrow={
          <Link href="/requests" className="row gap-sm">
            <ChevronRight size={14} />
            {ar.requests.title}
          </Link>
        }
      >
        <StatusBadge status={r.status} />
        <Print />
        {can(a, "requests.edit") &&
        (a.is_owner ||
          (r.created_by === a.id && editable(r.submitted_at, r.status))) ? (
          <Link className="btn edit-button" href={`/requests/${id}/edit`}>
            <Pencil size={15} />
            {ar.common.edit}
          </Link>
        ) : null}
      </Heading>
      <div className="stack">
        <section className="panel panel-body">
          <dl className="detail-values">
            <div>
              <dt>{ar.common.project}</dt>
              <dd>{String(r.project_name)}</dd>
            </div>
            <div>
              <dt>{ar.fields.createdBy}</dt>
              <dd>{String(r.created_by_name)}</dd>
            </div>
            <div>
              <dt>{ar.fields.createdAt}</dt>
              <dd>{date(r.created_at, d, true)}</dd>
            </div>
            <div>
              <dt>{ar.fields.supplier}</dt>
              <dd>{String(r.supplier_name || "—")}</dd>
            </div>
            <div>
              <dt>{ar.fields.expectedAt}</dt>
              <dd>{r.expected_at ? date(r.expected_at, d) : "—"}</dd>
            </div>
            <div>
              <dt>{ar.fields.notes}</dt>
              <dd className="break">{r.notes || "—"}</dd>
            </div>
          </dl>
        </section>
        <div className="no-print">
          <RequestActions
            actor={a}
            request={r}
            lines={
              r.lines as {
                id: string;
                material_name: unknown;
                quantity: unknown;
                price: unknown;
              }[]
            }
          />
        </div>
        <div className="details-grid">
          <div className="stack">
            <section className="panel">
              <div className="panel-heading">
                <h2>{ar.requests.lines}</h2>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{ar.fields.material}</th>
                      <th>{ar.fields.unit}</th>
                      <th>{ar.fields.requested}</th>
                      <th>{ar.fields.net}</th>
                      <th>{ar.fields.damaged}</th>
                      <th>{ar.fields.rejected}</th>
                      <th>{ar.fields.returned}</th>
                      {pricing ? <th>{ar.fields.price}</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {r.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="wrap">
                          <span className="cell-title">
                            {String(l.material_name)}
                          </span>
                          <span className="cell-sub">
                            <bdi className="code">{String(l.code)}</bdi> ·{" "}
                            {String(l.boq_name)}
                          </span>
                          {l.description ? (
                            <span className="cell-sub">
                              {String(l.description)}
                            </span>
                          ) : null}
                          {l.over ? (
                            <span
                              className={`badge ${l.overage_approved_by ? "green" : "red"}`}
                            >
                              {l.overage_approved_by
                                ? ar.common.verified
                                : ar.requests.overage}
                            </span>
                          ) : null}
                        </td>
                        <td>{String(l.unit_name)}</td>
                        <td>
                          <bdi>{number(String(l.quantity), d)}</bdi>
                        </td>
                        <td>
                          <bdi>
                            {number(Number(l.accepted) - Number(l.returned), d)}
                          </bdi>
                        </td>
                        <td>
                          <bdi>{number(String(l.damaged), d)}</bdi>
                        </td>
                        <td>
                          <bdi>{number(String(l.rejected), d)}</bdi>
                        </td>
                        <td>
                          <bdi>{number(String(l.returned), d)}</bdi>
                        </td>
                        {pricing ? (
                          <td>
                            {l.price !== null ? (
                              <>
                                <bdi>{number(String(l.price), d, 2)}</bdi>
                                <Riyal />
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>{ar.requests.receipts}</h2>
                <Link className="btn small" href={`/requests/${id}/receipts`}>
                  {ar.common.all}
                </Link>
              </div>
              {r.receipts.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{ar.fields.receivedBy}</th>
                        <th>{ar.common.date}</th>
                        <th>{ar.fields.notes}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.receipts.map((rec) => (
                        <tr key={rec.id}>
                          <td>{String(rec.received_by)}</td>
                          <td>{date(String(rec.created_at), d, true)}</td>
                          <td className="wrap">{String(rec.notes || "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty />
              )}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>{ar.fields.attachments}</h2>
                <Link
                  className="btn small"
                  href={`/requests/${id}/attachments`}
                >
                  {ar.common.all}
                </Link>
                {can(a, "receipts.create") || can(a, "requests.edit") ? (
                  <AttachmentUpload requestId={id} />
                ) : null}
              </div>
              <div className="panel-body stack">
                {r.files.length ? (
                  r.files.map((f) => (
                    <a
                      href={`/api/attachments/${f.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="attachment"
                      key={f.id}
                    >
                      <FileText size={20} />
                      <span>{String(f.name)}</span>
                    </a>
                  ))
                ) : (
                  <Empty />
                )}
              </div>
            </section>
          </div>
          <aside className="panel">
            <div className="panel-heading">
              <h2>{ar.requests.timeline}</h2>
            </div>
            <div className="timeline">
              {r.history.items.map((h) => (
                <div className="timeline-item" key={h.id}>
                  <p>{ar.statuses[Number(h.to_status)]}</p>
                  <small>{String(h.user_name)}</small>
                  <p className="cell-sub">
                    {date(String(h.created_at), d, true)}
                  </p>
                  {h.note ? <p className="muted">{String(h.note)}</p> : null}
                </div>
              ))}
            </div>
            <Pagination
              next={r.history.next}
              base={`/requests/${id}`}
              query={raw}
            />
          </aside>
        </div>
      </div>
    </>
  );
}
