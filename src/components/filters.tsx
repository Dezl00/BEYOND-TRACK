"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Download } from "lucide-react";
import { ar } from "@/messages/ar";
import { SelectBox, DateInput, Field, Lookup } from "./ui";
type Values = {
  q: string;
  status: string;
  from: string;
  to: string;
  action: string;
  entity: string;
  user: string;
};
function valuesFrom(params: URLSearchParams): Values {
  return {
    q: params.get("q") || "",
    status: params.get("status") || "all",
    from: params.get("from") || "",
    to: params.get("to") || "",
    action: params.get("action") || "all",
    entity: params.get("entity") || "all",
    user: params.get("user") || "",
  };
}
export default function Filters({
  statuses = false,
  exportable = false,
  audit = false,
}: {
  statuses?: boolean;
  exportable?: boolean;
  audit?: boolean;
}) {
  const router = useRouter(),
    path = usePathname(),
    params = useSearchParams(),
    [values, setValues] = useState(() =>
      valuesFrom(new URLSearchParams(params.toString())),
    ),
    [pending, startTransition] = useTransition();
  const latest = useRef(params.toString()),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  latest.current = params.toString();
  function navigate(nextValues: Values) {
    const next = new URLSearchParams(latest.current);
    next.delete("cursor");
    const fields = {
      q: nextValues.q,
      ...(statuses
        ? { status: nextValues.status === "all" ? "" : nextValues.status }
        : {}),
      ...(audit
        ? {
            from: nextValues.from,
            to: nextValues.to,
            action: nextValues.action === "all" ? "" : nextValues.action,
            entity: nextValues.entity === "all" ? "" : nextValues.entity,
            user: nextValues.user,
          }
        : {}),
    };
    for (const [key, value] of Object.entries(fields)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (next.toString() === latest.current) return;
    latest.current = next.toString();
    startTransition(() => router.replace(`${path}?${next}`, { scroll: false }));
  }
  function change(key: keyof Values, value: string) {
    const next = { ...values, [key]: value };
    setValues(next);
    if (timer.current) clearTimeout(timer.current);
    if (key === "q") timer.current = setTimeout(() => navigate(next), 180);
    else navigate(next);
  }
  useEffect(() => {
    const back = () => {
      if (timer.current) clearTimeout(timer.current);
      setValues(valuesFrom(new URLSearchParams(window.location.search)));
    };
    window.addEventListener("popstate", back);
    return () => {
      window.removeEventListener("popstate", back);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  return (
    <>
      {statuses ? (
        <div
          className="request-status-tabs"
          role="tablist"
          aria-label={ar.fields.status}
          aria-busy={pending || undefined}
        >
          {[
            { value: "all", label: ar.common.all },
            ...[0, 1, 9, 2, 3, 4, 5, 6, 7, 8].map((status) => ({
              value: String(status),
              label: ar.statuses[status],
            })),
          ].map((tab) => (
            <button
              type="button"
              key={tab.value}
              role="tab"
              aria-selected={values.status === tab.value}
              tabIndex={values.status === tab.value ? 0 : -1}
              aria-controls="request-results"
              className={values.status === tab.value ? "active" : ""}
              onClick={() => change("status", tab.value)}
              onMouseEnter={() => {
                const query = new URLSearchParams(latest.current);
                query.delete("cursor");
                if (tab.value === "all") query.delete("status");
                else query.set("status", tab.value);
                router.prefetch(`${path}?${query}`);
              }}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const buttons = Array.from(
                  event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                    '[role="tab"]',
                  ),
                );
                const index = buttons.indexOf(event.currentTarget);
                const target =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (index +
                          (event.key === "ArrowLeft" ? 1 : -1) +
                          buttons.length) %
                        buttons.length;
                buttons[target].focus();
                buttons[target].click();
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="toolbar" aria-busy={pending || undefined}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (timer.current) clearTimeout(timer.current);
            navigate(values);
          }}
        >
          <div className="search-field">
            <Search size={16} />
            <input
              className="input"
              aria-label={ar.common.search}
              placeholder={ar.common.search}
              value={values.q}
              onChange={(event) => change("q", event.target.value)}
            />
          </div>
          {audit ? (
            <>
              <Field label={ar.fields.user}>
                <Lookup
                  resource="users"
                  value={values.user}
                  onChange={(value) => change("user", value)}
                  allowNone
                  includeInactive
                />
              </Field>
              <Field label={ar.fields.action}>
                <SelectBox
                  value={values.action}
                  onChange={(value) => change("action", value)}
                  options={[
                    { value: "all", label: ar.common.all },
                    ...ar.auditActions.map((label, i) => ({
                      value: String(i),
                      label,
                    })),
                  ]}
                />
              </Field>
              <Field label={ar.fields.entity}>
                <SelectBox
                  value={values.entity}
                  onChange={(value) => change("entity", value)}
                  options={[
                    { value: "all", label: ar.common.all },
                    ...ar.auditEntities.map((label, i) => ({
                      value: String(i),
                      label,
                    })),
                  ]}
                />
              </Field>
              <Field label={ar.fields.from}>
                <DateInput
                  value={values.from}
                  onChange={(value) => change("from", value)}
                />
              </Field>
              <Field label={ar.fields.to}>
                <DateInput
                  value={values.to}
                  onChange={(value) => change("to", value)}
                />
              </Field>
            </>
          ) : null}
        </form>
        {exportable ? (
          <a
            className="btn small export-button"
            href={`/api/export?${params.toString()}&resource=${path.split("/")[1]}`}
          >
            <Download size={15} />
            {ar.common.exportPage}
          </a>
        ) : null}
        {pending ? (
          <span className="table-progress" aria-hidden="true" />
        ) : null}
      </div>
    </>
  );
}
