"use client";
import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search, Download } from "lucide-react";
import { ar } from "@/messages/ar";
import { Button, SelectBox, DateInput, Field, Lookup } from "./ui";
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
    [q, setQ] = useState(params.get("q") || ""),
    [status, setStatus] = useState(params.get("status") || "all"),
    [from, setFrom] = useState(params.get("from") || ""),
    [to, setTo] = useState(params.get("to") || ""),
    [action, setAction] = useState(params.get("action") || "all"),
    [entity, setEntity] = useState(params.get("entity") || "all"),
    [user, setUser] = useState(params.get("user") || "");
  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = new URLSearchParams(params.toString());
    next.delete("cursor");
    for (const [k, v] of Object.entries({
      q,
      status: status === "all" ? "" : status,
      ...(audit
        ? {
            from,
            to,
            action: action === "all" ? "" : action,
            entity: entity === "all" ? "" : entity,
            user,
          }
        : {}),
    })) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${path}?${next}`);
  }
  return (
    <div className="toolbar">
      <form onSubmit={submit}>
        <div className="search-field">
          <Search size={16} />
          <input
            className="input"
            aria-label={ar.common.search}
            placeholder={ar.common.search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {statuses ? (
          <SelectBox
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: ar.common.all },
              ...ar.statuses.map((label, i) => ({ value: String(i), label })),
            ]}
          />
        ) : null}
        {audit ? (
          <>
            <Field label={ar.fields.user}>
              <Lookup
                resource="users"
                value={user}
                onChange={setUser}
                allowNone
              />
            </Field>
            <Field label={ar.fields.action}>
              <SelectBox
                value={action}
                onChange={setAction}
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
                value={entity}
                onChange={setEntity}
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
              <DateInput value={from} onChange={setFrom} />
            </Field>
            <Field label={ar.fields.to}>
              <DateInput value={to} onChange={setTo} />
            </Field>
          </>
        ) : null}
        <Button type="submit">{ar.common.filter}</Button>
      </form>
      {exportable ? (
        <a
          className="btn small"
          href={`/api/export?${params.toString()}&resource=${path.split("/")[1]}`}
        >
          <Download size={15} />
          {ar.common.exportPage}
        </a>
      ) : null}
    </div>
  );
}
