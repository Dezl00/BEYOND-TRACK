"use client";
import { useLanguage } from "@/components/language-context";
import Link from "next/link";
import { Inbox, ArrowLeft, Plus } from "lucide-react";

import Breadcrumbs from "./breadcrumbs";
export function Brand() {
  const { m: msg } = useLanguage();
  
  return (
    <div className="brand" aria-label={msg.brand}>
      <span className="brand-images">
        <img
          src="/logo.svg"
          width="162"
          height="54"
          alt={msg.company}
          className="brand-image brand-light"
        />
        <img
          src="/logo-dark.svg"
          width="162"
          height="54"
          alt={msg.company}
          className="brand-image brand-dark"
        />
      </span>
    </div>
  );
}
export function StatusBadge({ status }: { status: number }) {
  const { m: msg } = useLanguage();
  
  return (
    <span
      className={`badge status-badge ${status === 5 || status === 6 ? "green" : status === 7 || status === 8 ? "red" : status > 0 ? "blue" : ""}`}
    >
      {msg.statuses[status]}
    </span>
  );
}
export function Empty() {
  const { m: msg } = useLanguage();
  
  return (
    <div className="empty">
      <Inbox size={30} />
      <span>{msg.common.empty}</span>
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
        <Breadcrumbs title={title} />
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
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
  const { m: msg } = useLanguage();
  
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
          {msg.common.reset}
        </Link>
      ) : null}
      {next ? (
        <Link className="btn small" href={`${base}?${params}`}>
          {msg.common.next}
          <ArrowLeft size={15} />
        </Link>
      ) : null}
    </div>
  );
}
export function Riyal() {
  const { m: msg } = useLanguage();
  
  return <span className="riyal" role="img" aria-label={msg.currency} />;
}
