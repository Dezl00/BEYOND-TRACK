"use client";
import { useLanguage } from "@/components/language-context";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, Printer, RotateCcw, Search } from "lucide-react";
import { Heading } from "./common";
import { Button, DateInput, Field, Lookup, MultiLookup, Message } from "./ui";

import { reportQuerySchema, type ReportQuery } from "@/lib/reporting";
import type { ReportContext } from "@/server/reports";

export function reportParams(query: ReportQuery) {
  const params = new URLSearchParams();
  if (query.project) params.set("project", query.project);
  if (query.items.length) params.set("items", query.items.join(","));
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.q) params.set("q", query.q);
  return params;
}
export default function ReportFilters({
  query,
  context,
  exportable,
}: {
  query: ReportQuery;
  context?: ReportContext;
  exportable: boolean;
}) {
  const { m: msg } = useLanguage();
  
  const router = useRouter();
  const [values, setValues] = useState(query),
    [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(query);
  latest.current = values;
  const params = reportParams(values);
  function navigate(next: ReportQuery) {
    const parsed = reportQuerySchema.safeParse(
      Object.fromEntries(reportParams(next)),
    );
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    startTransition(() =>
      router.replace(`/reports?${reportParams(parsed.data)}`, {
        scroll: false,
      }),
    );
  }
  function change(next: Partial<ReportQuery>, search = false) {
    if (timer.current) clearTimeout(timer.current);
    const changed = { ...latest.current, ...next };
    setValues(changed);
    if (search) timer.current = setTimeout(() => navigate(changed), 180);
    else navigate(changed);
  }
  useEffect(() => {
    const back = () => {
      if (timer.current) clearTimeout(timer.current);
      const parsed = reportQuerySchema.safeParse(
        Object.fromEntries(new URLSearchParams(window.location.search)),
      );
      if (parsed.success) {
        setValues(parsed.data);
        setError("");
      }
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return (
    <div className="report-controls" aria-busy={pending || undefined}>
      <Heading
        title={msg.reports.title}
        eyebrow={context ? `${context.code} · ${context.name}` : undefined}
      >
        {context && exportable ? (
          <>
            <Link
              className="btn export-button"
              target="_blank"
              rel="noopener noreferrer"
              href={`/reports/print?${params}`}
            >
              <Printer size={16} />
              {msg.common.print}
            </Link>
            <a
              className="btn export-button"
              href={`/api/reports/export?${params}`}
            >
              <Download size={16} />
              {msg.common.export}
            </a>
          </>
        ) : null}
      </Heading>
      <div className="report-filter-grid">
        <Field label={msg.common.project}>
          <Lookup
            resource="report-projects"
            value={values.project || ""}
            initialLabel={
              context ? `${context.code} · ${context.name}` : undefined
            }
            onChange={(project) =>
              change({ project: project || undefined, items: [], q: "" })
            }
            includeInactive
          />
        </Field>
        <Field label={msg.reports.items}>
          <MultiLookup
            key={values.project || "none"}
            resource="report-items"
            project={values.project}
            values={values.items}
            initialLabels={Object.fromEntries(
              (context?.selected || []).map((item) => [
                item.id,
                `${item.code} · ${item.name}`,
              ]),
            )}
            placeholder={msg.reports.allItems}
            disabled={!values.project}
            includeInactive
            onChange={(items) => change({ items })}
          />
        </Field>
        <Field label={msg.reports.from}>
          <DateInput
            value={values.from || ""}
            onChange={(from) => change({ from: from || undefined })}
          />
        </Field>
        <Field label={msg.reports.to}>
          <DateInput
            value={values.to || ""}
            onChange={(to) => change({ to: to || undefined })}
          />
        </Field>
        <div className="search-field">
          <Search size={16} />
          <input
            className="input"
            aria-label={msg.common.search}
            placeholder={msg.common.search}
            value={values.q}
            onChange={(event) => change({ q: event.target.value }, true)}
          />
        </div>
        <Button
          className="icon export-button"
          aria-label={msg.common.reset}
          onClick={() =>
            change({ from: undefined, to: undefined, items: [], q: "" })
          }
        >
          <RotateCcw size={16} />
        </Button>
      </div>
      <Message error={error} />
      <div
        className={`report-progress ${pending ? "pending" : ""}`}
        aria-hidden="true"
      />
    </div>
  );
}
