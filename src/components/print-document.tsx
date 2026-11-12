import { requestLanguage } from "@/server/language";

import { date } from "@/lib/format";

export async function DocumentHeader({
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
  const { m: msg, date } = await requestLanguage();
  
  return (
    <>
      <header className="document-header">
        <img src="/logo.svg" width="126" height="42" alt={msg.company} />
        <div className="document-title">
          <h1>{title}</h1>
          {reference ? <bdi className="code">{reference}</bdi> : null}
        </div>
        <div className="document-issued">
          <span>{msg.printing.generatedAt}</span>
          <bdi>{date(at, digits, true)}</bdi>
        </div>
      </header>
      <dl className="document-metadata">
        <div>
          <dt>{msg.common.project}</dt>
          <dd>{project}</dd>
        </div>
        <div>
          <dt>{msg.printing.projectCode}</dt>
          <dd>
            <bdi className="code">{code}</bdi>
          </dd>
        </div>
        {location ? (
          <div>
            <dt>{msg.printing.location}</dt>
            <dd>{location}</dd>
          </div>
        ) : null}
        <div>
          <dt>{msg.printing.preparedBy}</dt>
          <dd>{issuedBy}</dd>
        </div>
      </dl>
    </>
  );
}
export function SectionComplete({ name }: { name: string }) {
  return <span data-print-complete={name} hidden />;
}
