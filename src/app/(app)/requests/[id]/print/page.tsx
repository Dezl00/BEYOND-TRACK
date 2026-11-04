import Decimal from "decimal.js";
import { requirePageActor } from "@/server/page-auth";
import { currentSettings } from "@/server/settings";
import {
  printRequestHeader,
  printRequestLines,
  printReceipts,
  printHistory,
  printAttachments,
} from "@/server/request-print";
import { requestPrintSchema, printSectionKeys } from "@/lib/reporting";
import { uuid } from "@/lib/validation";
import { type Actor, can } from "@/lib/domain";
import { date, number, requestCode } from "@/lib/format";
import { ar } from "@/messages/ar";
import { Riyal } from "@/components/common";
import DocumentActions from "@/components/document-actions";
import { DocumentHeader, SectionComplete } from "@/components/print-document";

async function Materials({
  actor,
  id,
  digits,
  prices,
}: {
  actor: Actor;
  id: string;
  digits: number;
  prices: boolean;
}) {
  const lines = await printRequestLines(actor, id, prices);
  return (
    <section className="document-section">
      <h2 className="document-section-title">{ar.printing.materials}</h2>
      <table className="document-table request-materials-table">
        <thead>
          <tr>
            <th className="serial">{ar.printing.serial}</th>
            <th>
              {ar.printing.material} / {ar.printing.item}
            </th>
            <th>{ar.fields.unit}</th>
            <th>{ar.fields.quantity}</th>
            <th>{ar.fields.net}</th>
            {prices ? (
              <>
                <th>
                  {ar.fields.price} <Riyal />
                </th>
                <th>
                  {ar.fields.total} <Riyal />
                </th>
              </>
            ) : null}
            <th>{ar.fields.notes}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id}>
              <td>
                <bdi>{number(index + 1, digits, 0)}</bdi>
              </td>
              <td className="print-material-name">
                <b>{line.material_name}</b>
                <small>
                  <bdi className="code">{line.code}</bdi> · {line.boq_name}
                </small>
              </td>
              <td>{line.unit_name}</td>
              <td className="numeric">
                <bdi>{number(line.quantity, digits)}</bdi>
              </td>
              <td className="numeric">
                <bdi>{number(line.received, digits)}</bdi>
              </td>
              {prices ? (
                <>
                  <td className="numeric">
                    <bdi>
                      {line.price === null
                        ? "—"
                        : number(line.price, digits, 2)}
                    </bdi>
                  </td>
                  <td className="numeric">
                    <bdi>
                      {line.price === null
                        ? "—"
                        : number(
                            new Decimal(line.quantity)
                              .mul(line.price)
                              .toFixed(2),
                            digits,
                            2,
                          )}
                    </bdi>
                  </td>
                </>
              ) : null}
              <td className="print-notes">{line.notes || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SectionComplete name="materials" />
    </section>
  );
}
async function Receipts({
  actor,
  id,
  digits,
  cursor,
  offset = 0,
}: {
  actor: Actor;
  id: string;
  digits: number;
  cursor?: string;
  offset?: number;
}) {
  const data = await printReceipts(actor, id, cursor);
  return (
    <>
      {!offset && !data.items.length ? (
        <p className="document-empty">{ar.common.empty}</p>
      ) : null}
      {data.items.map((receipt, index) => (
        <section className="document-receipt" key={receipt.id}>
          <div className="document-receipt-heading">
            <h3>
              {ar.printing.receiptNumber}{" "}
              <bdi>{number(offset + index + 1, digits, 0)}</bdi>
            </h3>
            <span>
              {ar.fields.receivedBy}: {receipt.received_by}
            </span>
            <bdi>{date(receipt.created_at, digits, true)}</bdi>
          </div>
          {receipt.notes ? (
            <p className="document-receipt-note">{receipt.notes}</p>
          ) : null}
          <table className="document-table receipt-print-table">
            <thead>
              <tr>
                <th>
                  {ar.printing.material} / {ar.fields.code}
                </th>
                <th>{ar.fields.unit}</th>
                <th>{ar.fields.accepted}</th>
                <th>{ar.fields.damaged}</th>
                <th>{ar.fields.rejected}</th>
                <th>{ar.fields.returned}</th>
                <th>{ar.printing.net}</th>
              </tr>
            </thead>
            <tbody>
              {receipt.lines.map((line) => (
                <tr key={line.id}>
                  <td className="print-material-name">
                    {line.name}
                    <small>
                      <bdi className="code">{line.code}</bdi> · {line.boq_name}
                    </small>
                  </td>
                  <td>{line.unit_name}</td>
                  {[
                    line.accepted,
                    line.damaged,
                    line.rejected,
                    line.returned,
                    new Decimal(line.accepted).minus(line.returned).toFixed(3),
                  ].map((value, cell) => (
                    <td className="numeric" key={cell}>
                      <bdi>{number(value, digits)}</bdi>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      {data.next ? (
        <Receipts
          actor={actor}
          id={id}
          digits={digits}
          cursor={data.next}
          offset={offset + data.items.length}
        />
      ) : (
        <SectionComplete name="receipts" />
      )}
    </>
  );
}
async function HistoryRows({
  actor,
  id,
  digits,
  cursor,
}: {
  actor: Actor;
  id: string;
  digits: number;
  cursor?: string;
}) {
  const data = await printHistory(actor, id, cursor);
  return (
    <>
      {!cursor && !data.items.length ? (
        <tr>
          <td colSpan={5}>{ar.common.empty}</td>
        </tr>
      ) : null}
      {data.items.map((item) => (
        <tr key={item.id}>
          <td>
            <bdi>{date(item.created_at, digits, true)}</bdi>
          </td>
          <td>{item.user_name}</td>
          <td>
            {item.from_status === null ? "—" : ar.statuses[item.from_status]}
          </td>
          <td>{ar.statuses[item.to_status]}</td>
          <td className="print-notes">{item.note || "—"}</td>
        </tr>
      ))}
      {data.next ? (
        <HistoryRows actor={actor} id={id} digits={digits} cursor={data.next} />
      ) : (
        <tr hidden data-print-complete="timeline">
          <td colSpan={5} />
        </tr>
      )}
    </>
  );
}
async function AttachmentBatches({
  actor,
  id,
  digits,
  photos,
  cursor,
  offset = 0,
}: {
  actor: Actor;
  id: string;
  digits: number;
  photos: boolean;
  cursor?: string;
  offset?: number;
}) {
  const data = await printAttachments(actor, id, cursor);
  return (
    <>
      {!offset && !data.items.length ? (
        <p className="document-empty">{ar.common.empty}</p>
      ) : null}
      {data.items.length ? (
        <table className="document-table attachment-print-table">
          <thead>
            <tr>
              <th className="serial">{ar.printing.serial}</th>
              <th>{ar.printing.fileName}</th>
              <th>{ar.printing.fileType}</th>
              <th>{ar.common.date}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((file, index) => (
              <tr key={file.id}>
                <td>
                  <bdi>{number(offset + index + 1, digits, 0)}</bdi>
                </td>
                <td>
                  <a
                    href={`/api/attachments/${file.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {file.name}
                  </a>
                </td>
                <td>
                  <bdi className="code">{file.format.toUpperCase()}</bdi>
                </td>
                <td>
                  <bdi>{date(file.created_at, digits, true)}</bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {photos ? (
        <div className="document-photos">
          {data.items
            .filter((file) => file.format !== "pdf")
            .map((file) => (
              <figure key={file.id}>
                <img
                  src={`/api/attachments/${file.id}`}
                  alt={file.name}
                  loading="eager"
                />
                <figcaption>{file.name}</figcaption>
              </figure>
            ))}
        </div>
      ) : null}
      {data.next ? (
        <AttachmentBatches
          actor={actor}
          id={id}
          digits={digits}
          photos={photos}
          cursor={data.next}
          offset={offset + data.items.length}
        />
      ) : (
        <SectionComplete name="attachments" />
      )}
    </>
  );
}
export default async function RequestPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const actor = await requirePageActor(),
    id = uuid.parse((await params).id),
    options = requestPrintSchema.parse(await searchParams);
  const [request, settings] = await Promise.all([
    printRequestHeader(actor, id),
    currentSettings(),
  ]);
  const digits = settings?.digits || 0,
    prices = options.prices === "1" && can(actor, "procurement.view"),
    at = new Date().toISOString();
  const sections = printSectionKeys.filter((key) => options[key] === "1");
  return (
    <div className="document-preview">
      <DocumentActions back={`/requests/${id}`} sections={[...sections]} />
      <article className="print-document request-document">
        <DocumentHeader
          title={ar.printing.document}
          reference={requestCode(request.number)}
          project={request.project_name}
          code={request.project_code}
          location={request.location}
          issuedBy={actor.name}
          at={at}
          digits={digits}
        />
        <dl className="document-metadata request-document-metadata">
          <div>
            <dt>{ar.fields.createdBy}</dt>
            <dd>{request.created_by_name}</dd>
          </div>
          <div>
            <dt>{ar.fields.createdAt}</dt>
            <dd>
              <bdi>{date(request.created_at, digits, true)}</bdi>
            </dd>
          </div>
          <div>
            <dt>{ar.fields.status}</dt>
            <dd>{ar.statuses[request.status]}</dd>
          </div>
          <div>
            <dt>{ar.fields.supplier}</dt>
            <dd>{request.supplier_name || "—"}</dd>
          </div>
          <div>
            <dt>{ar.fields.expectedAt}</dt>
            <dd>
              <bdi>
                {request.expected_at
                  ? date(`${request.expected_at}T12:00:00Z`, digits)
                  : "—"}
              </bdi>
            </dd>
          </div>
          <div>
            <dt>{ar.fields.submittedAt}</dt>
            <dd>
              <bdi>
                {request.submitted_at
                  ? date(request.submitted_at, digits, true)
                  : "—"}
              </bdi>
            </dd>
          </div>
        </dl>
        {request.notes ? (
          <div className="document-request-notes">
            <b>{ar.fields.notes}</b>
            <span>{request.notes}</span>
          </div>
        ) : null}
        {options.materials === "1" ? (
          <Materials actor={actor} id={id} digits={digits} prices={prices} />
        ) : null}
        {options.receipts === "1" ? (
          <section className="document-section">
            <h2 className="document-section-title">{ar.printing.receipts}</h2>
            <Receipts actor={actor} id={id} digits={digits} />
          </section>
        ) : null}
        {options.attachments === "1" ? (
          <section className="document-section">
            <h2 className="document-section-title">
              {ar.printing.attachments}
            </h2>
            <AttachmentBatches
              actor={actor}
              id={id}
              digits={digits}
              photos={options.photos === "1"}
            />
          </section>
        ) : null}
        {options.timeline === "1" ? (
          <section className="document-section">
            <h2 className="document-section-title">{ar.printing.timeline}</h2>
            <table className="document-table timeline-print-table">
              <thead>
                <tr>
                  <th>{ar.common.date}</th>
                  <th>{ar.fields.user}</th>
                  <th>{ar.fields.before}</th>
                  <th>{ar.fields.after}</th>
                  <th>{ar.fields.notes}</th>
                </tr>
              </thead>
              <tbody>
                <HistoryRows actor={actor} id={id} digits={digits} />
              </tbody>
            </table>
          </section>
        ) : null}
        <footer className="document-footer">
          <span>{ar.company}</span>
          <bdi className="code">{requestCode(request.number)}</bdi>
          <span>{request.project_name}</span>
        </footer>
      </article>
    </div>
  );
}
