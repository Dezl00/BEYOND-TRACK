import Link from "next/link";
import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth";
import { listRequests } from "@/server/queries";
import { listQuerySchema } from "@/lib/validation";
import { can } from "@/lib/domain";
import { ar } from "@/messages/ar";
import { one, sql } from "@/db";
import { Heading, Pagination } from "@/components/common";
import RequestTable from "@/components/request-table";
import Filters from "@/components/filters";
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const a = await requireActor(),
    raw = await searchParams,
    q = listQuerySchema.parse(raw),
    data = await listRequests(a, q),
    settings = await one<{ digits: number }>(
      sql`SELECT digits FROM settings WHERE id=1`,
    );
  return (
    <>
      <Heading title={ar.requests.title}>
        {can(a, "requests.create") ? (
          <Link
            className="btn green"
            href={`/requests/new${q.project ? `?project=${q.project}` : ""}`}
          >
            <Plus size={17} />
            {ar.requests.new}
          </Link>
        ) : null}
      </Heading>
      <section className="panel">
        <Filters statuses exportable={can(a, "requests.export")} />
        <RequestTable items={data.items} digits={settings?.digits} />
        <Pagination next={data.next} base="/requests" query={raw} />
      </section>
    </>
  );
}
