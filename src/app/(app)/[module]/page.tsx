import { requestLanguage } from "@/server/language";
import ActivationSwitch from "@/components/activation-switch";
import BoqTabs from "@/components/boq-tabs";
import { currentSettings } from "@/server/settings";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageActor } from "@/server/page-auth";
import {
  listResource,
  sectionLabels,
  listRequests,
  auditList,
  notifications,
} from "@/server/queries";
import { listQuerySchema } from "@/lib/validation";

import RequestPurge from "@/components/request-purge";
import { can, canManageUnits, requestModules } from "@/lib/domain";
import { number, date, requestCode } from "@/lib/format";
import { one, sql } from "@/db";
import { Empty, Pagination } from "@/components/common";
import ResourceForm from "@/components/resource-form";
import Filters from "@/components/filters";
import RequestTable from "@/components/request-table";
import { NotificationRead } from "@/components/simple-actions";
import { translateDiff } from "@/lib/audit-format";
import UserSessions from "@/components/user-sessions";
import DeleteButton from "@/components/delete-button";
import { ChartNoAxesCombined } from "lucide-react";
const resources = {
  projects: "project",
  boq: "boq",
  materials: "material",
  suppliers: "supplier",
  units: "unit",
  users: "user",
  roles: "role",
} as const;
export default async function ResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { m: msg,locale, date, number, unit, role } = await requestLanguage();
  
const title = (key: string) =>
  key === "materials"
    ? msg.boq.materials
    : key === "units"
      ? msg.boq.units
      : msg.nav[key as keyof typeof msg.nav];
  const { module } = await params;
  if (
    ![
      ...Object.keys(resources),
      ...requestModules,
      "technical",
      "finance",
      "receipts",
      "audit",
      "notifications",
    ].includes(module)
  )
    notFound();
  const a = await requirePageActor(),
    raw = await searchParams,
    q = listQuerySchema.parse(raw),
    settings = await currentSettings(),
    digits = settings?.digits || 0;
  if (module === "units" && !canManageUnits(a)) notFound();
  const catalog =
    module === "boq" || module === "materials" ? module : undefined;
  const permission = ["materials", "units"].includes(module) ? "boq" : module;
  const data =
    module === "audit"
      ? await auditList(a, q)
      : module === "notifications"
        ? await notifications(a, q.cursor, q.q,locale)
        : (requestModules as readonly string[]).includes(module)
          ? await listRequests(a, q, module)
          : await listResource(a, module, q);
  return (
    <>
      <Filters
        key={module + (q.project ?? "")}
        catalog={catalog}
        project={q.project}
        sectionLabels={catalog ? await sectionLabels(a, q) : undefined}
        title={title(module)}
        actions={
          <>
            {module in resources && can(a, `${permission}.create`) ? (
              <ResourceForm
                resource={resources[module as keyof typeof resources]}
                project={q.project}
                actor={a}
              />
            ) : null}
            {module === "notifications" ? <NotificationRead /> : null}
          </>
        }
        statuses={(requestModules as readonly string[]).includes(module)}
        exportable={can(a, `${permission}.export`)}
        audit={module === "audit"}
      />
      {["boq", "materials", "units"].includes(module) ? (
        <BoqTabs
          current={module}
          mains={q.mains}
          seconds={q.seconds}
          canUnits={canManageUnits(a)}
          project={q.project}
          canImport={can(a, "boq.create")}
        />
      ) : null}
      <section className="panel table-panel">
        {(requestModules as readonly string[]).includes(module) ? (
          <RequestTable items={data.items} digits={digits} />
        ) : !data.items.length ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {module === "audit" ? (
                    <>
                      <th>{msg.fields.user}</th>
                      <th>{msg.fields.action}</th>
                      <th>{msg.fields.entity}</th>
                      <th>{msg.common.project}</th>
                      <th>{msg.common.date}</th>
                      <th>{msg.fields.diff}</th>
                    </>
                  ) : module === "notifications" ? (
                    <>
                      <th>{msg.fields.type}</th>
                      <th>{msg.fields.requestNumber}</th>
                      <th>{msg.common.date}</th>
                      <th>{msg.common.actions}</th>
                    </>
                  ) : (
                    <>
                      <th>{msg.fields.name}</th>
                      {module === "projects" && (
                        <>
                          <th>{msg.interface.client}</th>
                          <th>{msg.interface.startDate}</th>
                          <th>{msg.interface.endDate}</th>
                          <th>{msg.interface.projectDetails}</th>
                        </>
                      )}
                      {["projects", "boq", "materials"].includes(module) ? (
                        <th>{msg.fields.code}</th>
                      ) : null}
                      {["boq", "materials"].includes(module) ? (
                        <>
                          <th>{msg.fields.unit}</th>
                          <th>{msg.fields.quantity}</th>
                        </>
                      ) : null}
                      {module === "boq" ? (
                        <>
                          <th>{msg.fields.level}</th>
                          <th>{msg.fields.description}</th>
                        </>
                      ) : null}
                      {module === "users" ? (
                        <>
                          <th>{msg.fields.email}</th>
                          <th>{msg.whatsapp.number}</th>
                          <th>{msg.fields.role}</th>
                          <th>{msg.fields.status}</th>
                        </>
                      ) : null}
                      {module === "units" ? <th>{msg.fields.symbol}</th> : null}
                      {[
                        "suppliers",
                        "projects",
                        "materials",
                        "boq",
                        "roles",
                        "units",
                      ].includes(module) ? (
                        <th>{msg.fields.status}</th>
                      ) : null}
                      <th>{msg.common.actions}</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id}>
                    {module === "audit" ? (
                      <>
                        <td>{String(row.user_name || "—")}</td>
                        <td>{msg.auditActions[Number(row.action)]}</td>
                        <td>
                          {msg.auditEntities[Number(row.entity)]}
                          <span className="cell-sub code">
                            {String(row.entity_id || "")}
                          </span>
                        </td>
                        <td>{String(row.project_name || "—")}</td>
                        <td>{date(String(row.created_at), digits, true)}</td>
                        <td className="wrap">
                          <details>
                            <summary>{msg.common.details}</summary>
                            <pre className="audit-diff break">
                              {JSON.stringify(translateDiff(row.diff, msg), null, 2)}
                            </pre>
                            <bdi className="code">{String(row.ip)}</bdi>
                          </details>
                        </td>
                      </>
                    ) : module === "notifications" ? (
                      <>
                        <td>
                          <span
                            className={row.read_at ? "muted" : "cell-title"}
                          >
                            {msg.notificationTypes[Number(row.type)]}
                          </span>
                        </td>
                        <td>
                          <Link
                            href={`/requests/${row.request_id}`}
                            className="code"
                          >
                            {requestCode(String(row.number))}
                          </Link>
                        </td>
                        <td>{date(String(row.created_at), digits, true)}</td>
                        <td>
                          {!row.read_at ? (
                            <NotificationRead id={row.id} />
                          ) : null}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="wrap">
                          <span className="cell-title">{module === "units" ? unit(row.name) : module === "roles" ? role(row.name) : String(row.name)}</span>
                          {row.location || row.job_title || row.boq_name ? (
                            <span className="cell-sub">
                              {String(
                                row.location || row.job_title || row.boq_name,
                              )}
                            </span>
                          ) : null}
                        </td>
                        {module === "projects" && (
                          <>
                            <td>{String(row.client || "—")}</td>
                            <td>
                              {row.start_date
                                ? date(String(row.start_date), digits)
                                : "—"}
                            </td>
                            <td>
                              {row.end_date
                                ? date(String(row.end_date), digits)
                                : "—"}
                            </td>
                            <td className="wrap">
                              {row.details ? (
                                <details>
                                  <summary>{msg.common.details}</summary>
                                  <p className="break">{String(row.details)}</p>
                                </details>
                              ) : (
                                "—"
                              )}
                            </td>
                          </>
                        )}
                        {["projects", "boq", "materials"].includes(module) ? (
                          <td>
                            <bdi className="code">{String(row.code)}</bdi>
                          </td>
                        ) : null}
                        {["boq", "materials"].includes(module) ? (
                          <>
                            <td>{unit(row.unit_name ?? "—")}</td>
                            <td>
                              <bdi>
                                {row.quantity == null
                                  ? "—"
                                  : number(String(row.quantity), digits)}
                              </bdi>
                            </td>
                          </>
                        ) : null}
                        {module === "boq" ? (
                          <>
                            <td>
                              {
                                [msg.boq.main, msg.boq.secondary, msg.boq.sub][
                                  Number(row.level) - 1
                                ]
                              }
                            </td>
                            <td className="wrap muted">
                              {String(row.description || "—")}
                            </td>
                          </>
                        ) : null}
                        {module === "users" ? (
                          <>
                            <td>
                              <bdi>{String(row.email)}</bdi>
                            </td>
                            <td>
                              {row.whatsapp_number ? (
                                <>
                                  <bdi dir="ltr" className="code">
                                    {String(row.whatsapp_country_code)}
                                    {String(row.whatsapp_number)}
                                  </bdi>
                                  <span className="cell-sub">
                                    {row.whatsapp_enabled
                                      ? msg.whatsapp.ready
                                      : msg.whatsapp.accountDisabled}
                                  </span>
                                </>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>
                              {row.is_owner
                                ? msg.auth.owner
                                : role(row.role_name)}
                            </td>
                            <td>
                              <ActivationSwitch
                                resource="user"
                                id={row.id}
                                active={!row.locked}
                                name={String(row.name)}
                                disabled={
                                  !can(a, "users.edit") || Boolean(row.is_owner)
                                }
                              />
                            </td>
                          </>
                        ) : null}
                        {module === "units" ? (
                          <td>{unit(row.symbol,true)}</td>
                        ) : null}
                        {[
                          "suppliers",
                          "projects",
                          "materials",
                          "boq",
                          "roles",
                          "units",
                        ].includes(module) ? (
                          <td>
                            <ActivationSwitch
                              resource={
                                resources[module as keyof typeof resources]
                              }
                              id={row.id}
                              name={String(row.name)}
                              active={
                                module === "projects"
                                  ? !row.archived
                                  : row.active !== false
                              }
                              disabled={
                                !can(a, `${permission}.edit`) ||
                                Boolean(row.owner_role)
                              }
                            />
                          </td>
                        ) : null}
                        <td>
                          <div className="table-actions">
                            {module === "projects" && a.is_owner && (
                              <RequestPurge
                                email={a.email}
                                project={{ id: row.id, name: String(row.name) }}
                              />
                            )}
                            {module === "projects" && can(a, "reports.view") ? (
                              <Link
                                className="btn icon small export-button"
                                href={`/reports?project=${row.id}`}
                                aria-label={msg.reports.title}
                              >
                                <ChartNoAxesCombined size={17} />
                              </Link>
                            ) : null}
                            {can(a, `${permission}.edit`) &&
                            (!row.is_owner || a.is_owner) ? (
                              <ResourceForm
                                resource={
                                  resources[module as keyof typeof resources]
                                }
                                initial={row}
                                project={q.project}
                                actor={a}
                              />
                            ) : null}
                            {module === "users" &&
                            can(a, "security.manage") &&
                            (!row.is_owner || a.is_owner) ? (
                              <UserSessions userId={row.id} />
                            ) : null}
                            {[
                              "boq",
                              "materials",
                              "units",
                              "suppliers",
                              "roles",
                              "users",
                            ].includes(module) &&
                            can(a, `${permission}.delete`) &&
                            !row.is_owner &&
                            !row.owner_role ? (
                              <DeleteButton
                                resource={
                                  resources[module as keyof typeof resources]
                                }
                                id={row.id}
                              />
                            ) : null}
                          </div>{" "}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination next={data.next} base={`/${module}`} query={raw} />
      </section>
    </>
  );
}
