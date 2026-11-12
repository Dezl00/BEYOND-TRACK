import { requestLanguage } from "@/server/language";
import { currentSettings } from "@/server/settings";
import Link from "next/link";
import {
  ClipboardCheck as ClipboardClock,
  Truck,
  PackageCheck,
  ClipboardList,
  Plus,
  ArrowLeft,
} from "lucide-react";
import { requirePageActor } from "@/server/page-auth";
import { dashboard } from "@/server/queries";
import { listQuerySchema } from "@/lib/validation";
import { can } from "@/lib/domain";

import { number } from "@/lib/format";
import { one, sql } from "@/db";
import { Heading, Empty } from "@/components/common";
import RequestTable from "@/components/request-table";
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { m: msg, number, unit } = await requestLanguage();
  
  const a = await requirePageActor(),
    q = listQuerySchema.parse(await searchParams),
    [data, settings] = await Promise.all([
      dashboard(a, q.project),
      currentSettings(),
    ]);
  const d = settings?.digits || 0;
  return (
    <>
      <Heading title={msg.dashboard.title} eyebrow={msg.dashboard.overview}>
        {can(a, "requests.create") ? (
          <Link
            className="btn green"
            href={`/requests/new${q.project ? `?project=${q.project}` : ""}`}
          >
            <Plus size={17} />
            {msg.requests.new}
          </Link>
        ) : null}
      </Heading>
      <div className="stats">
        {(
          [
            ["waiting", ClipboardClock],
            ["overdue", Truck],
            ["open", ClipboardList],
            ["complete", PackageCheck],
          ] as const
        ).map(([key, Icon]) => (
          <div className={`stat stat-${key}`} key={key}>
            <div className="stat-top">
              <span>{msg.dashboard[key]}</span>
              <span className="stat-icon">
                <Icon size={27} strokeWidth={1.6} />
              </span>
            </div>
            <div className="stat-value">{number(data.stats[key], d, 0)}</div>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>{msg.dashboard.latest}</h2>
            <Link className="btn link small" href="/requests">
              {msg.common.all}
              <ArrowLeft size={14} />
            </Link>
          </div>
          <RequestTable items={data.latest} digits={d} />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>{msg.dashboard.quantities}</h2>
          </div>
          {data.quantities.length ? (
            data.quantities.map((item) => (
              <div className="quantity-block" key={item.id}>
                <h3>{unit(item.name)}</h3>
                <div className="quantity-values">
                  <span>
                    <span className="muted">{msg.dashboard.requested}</span>{" "}
                    <bdi>{number(item.requested, d)}</bdi>
                  </span>
                  <span>
                    <span className="muted">{msg.dashboard.received}</span>{" "}
                    <bdi>{number(item.received, d)}</bdi>
                  </span>
                </div>
                <div className="progress">
                  <span
                    style={{
                      width: `${Math.min(100, (Number(item.received) / Math.max(1, Number(item.requested))) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <Empty />
          )}
        </section>
      </div>
    </>
  );
}
