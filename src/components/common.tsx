import Link from "next/link";
import { Inbox, ArrowLeft, Plus } from "lucide-react";
import { ar } from "@/messages/ar";
export function Brand() {
  return (
    <div className="brand" aria-label={ar.brand}>
      <span role="img" aria-label={ar.company} className="brand-image" />
      <span className="brand-track">{ar.brandTrack}</span>
    </div>
  );
}
export function StatusBadge({ status }: { status: number }) {
  return (
    <span
      className={`badge ${status === 5 || status === 6 ? "green" : status === 7 || status === 8 ? "red" : status > 0 ? "blue" : ""}`}
    >
      {ar.statuses[status]}
    </span>
  );
}
export function Empty() {
  return (
    <div className="empty">
      <Inbox size={30} />
      <span>{ar.common.empty}</span>
    </div>
  );
}
export function Heading({
  title,
  children,
  eyebrow,
}: {
  title: string;
  children?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
      </div>
      {children ? <div className="row no-print">{children}</div> : null}
    </div>
  );
}
export function Pagination({
  next,
  base,
  query,
}: {
  next: string | null;
  base: string;
  query?: Record<string, string | undefined>;
}) {
  const params = new URLSearchParams(
    Object.entries(query || {}).filter((e): e is [string, string] => !!e[1]),
  );
  if (next) params.set("cursor", next);
  else params.delete("cursor");
  return (
    <div className="pagination">
      {query?.cursor ? (
        <Link
          className="btn small"
          href={
            base +
            "?" +
            new URLSearchParams(
              Object.entries(query).filter(
                (e): e is [string, string] => !!e[1] && e[0] !== "cursor",
              ),
            )
          }
        >
          {ar.common.reset}
        </Link>
      ) : null}
      {next ? (
        <Link className="btn small" href={`${base}?${params}`}>
          {ar.common.next}
          <ArrowLeft size={15} />
        </Link>
      ) : null}
    </div>
  );
}
export function Riyal() {
  return <span className="riyal" role="img" aria-label={ar.currency} />;
}
