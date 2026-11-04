import { currentSettings } from "@/server/settings";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requirePageActor } from "@/server/page-auth";
import { listRequests } from "@/server/queries";
import { listQuerySchema } from "@/lib/validation";
import { can } from "@/lib/domain";
import { ar } from "@/messages/ar";
import { one, sql } from "@/db";
import { Pagination } from "@/components/common";
import RequestTable from "@/components/request-table";
import Filters from "@/components/filters";
export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const a = await requirePageActor(),
    raw = await searchParams,
    q = listQuerySchema.parse(raw),
    data = await listRequests(a, q),
    settings = await currentSettings();
  return (
    <>
      <Filters
        title={ar.requests.title}
        statuses
        exportable={can(a, "requests.export")}
        actions={
          can(a, "requests.create") ? (
            <Link
              className="btn green"
              href={`/requests/new${q.project ? `?project=${q.project}` : ""}`}
            >
              <Plus size={17} />
              {ar.requests.new}
            </Link>
          ) : null
        }
      />
      <section className="panel table-panel">
        <RequestTable items={data.items} digits={settings?.digits} />
        <Pagination next={data.next} base="/requests" query={raw} />
      </section>
    </>
  );
}
