import Link from "next/link";
import { FileText } from "lucide-react";
import { requireActor } from "@/server/auth";
import { requireRequest } from "@/server/access";
import { rows, sql } from "@/db";
import { uuid, cursorSchema } from "@/lib/validation";
import { decodeCursor, page } from "@/server/queries";
import { ar } from "@/messages/ar";
import { Heading, Pagination, Empty } from "@/components/common";
export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const a = await requireActor(),
    id = uuid.parse((await params).id),
    q = await searchParams,
    c = decodeCursor(cursorSchema.parse(q.cursor));
  await requireRequest(a, id);
  const data = page(
    await rows<{ id: string; name: string; created_at: Date }>(
      sql`SELECT id,name,created_at FROM attachments WHERE request_id=${id} ${c ? sql`AND(created_at,id)<(${c.at}::timestamptz,${c.id}::uuid)` : sql``} ORDER BY created_at DESC,id DESC LIMIT 26`,
    ),
    true,
  );
  return (
    <>
      <Heading title={ar.fields.attachments}>
        <Link className="btn" href={`/requests/${id}`}>
          {ar.common.back}
        </Link>
      </Heading>
      <section className="panel">
        <div className="panel-body stack">
          {data.items.length ? (
            data.items.map((f) => (
              <a
                href={`/api/attachments/${f.id}`}
                key={f.id}
                className="attachment"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileText size={20} />
                {f.name}
              </a>
            ))
          ) : (
            <Empty />
          )}
        </div>
        <Pagination
          base={`/requests/${id}/attachments`}
          next={data.next}
          query={q}
        />
      </section>
    </>
  );
}
