import { ar } from "@/messages/ar";
import { date } from "@/lib/format";

export function DocumentHeader({
  title,
  reference,
  project,
  code,
  location,
  issuedBy,
  at,
  digits,
}: {
  title: string;
  reference?: string;
  project: string;
  code: string;
  location?: string;
  issuedBy: string;
  at: string;
  digits: number;
}) {
  return (
    <>
      <header className="document-header">
        <img src="/logo.svg" width="126" height="42" alt={ar.company} />
        <div className="document-title">
          <h1>{title}</h1>
          {reference ? <bdi className="code">{reference}</bdi> : null}
        </div>
        <div className="document-issued">
          <span>{ar.printing.generatedAt}</span>
          <bdi>{date(at, digits, true)}</bdi>
        </div>
      </header>
      <dl className="document-metadata">
        <div>
          <dt>{ar.common.project}</dt>
          <dd>{project}</dd>
        </div>
        <div>
          <dt>{ar.printing.projectCode}</dt>
          <dd>
            <bdi className="code">{code}</bdi>
          </dd>
        </div>
        {location ? (
          <div>
            <dt>{ar.printing.location}</dt>
            <dd>{location}</dd>
          </div>
        ) : null}
        <div>
          <dt>{ar.printing.preparedBy}</dt>
          <dd>{issuedBy}</dd>
        </div>
      </dl>
    </>
  );
}
export function SectionComplete({ name }: { name: string }) {
  return <span data-print-complete={name} hidden />;
}
