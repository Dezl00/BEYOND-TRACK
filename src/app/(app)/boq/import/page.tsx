import { requireActor } from "@/server/auth";
import { requirePermission } from "@/server/access";
import { listQuerySchema } from "@/lib/validation";
import { ar } from "@/messages/ar";
import { Heading } from "@/components/common";
import ImportForm from "@/components/import-form";
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const a = await requireActor();
  requirePermission(a, "boq.create");
  const q = listQuerySchema.parse(await searchParams);
  return (
    <>
      <Heading title={ar.boq.importTitle} />
      <section className="panel panel-body">
        <ImportForm project={q.project} />
      </section>
      <section className="panel" style={{ marginBlockStart: 24 }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {ar.boq.headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <bdi className="code">01.01.01</bdi>
                </td>
                <td>{ar.seed.sampleSub}</td>
                <td>3</td>
                <td>
                  <bdi className="code">01.01</bdi>
                </td>
                <td>{ar.seed.units[2][0]}</td>
                <td>100</td>
                <td>{ar.seed.sampleDescription}</td>
                <td>{ar.seed.sampleMaterial}</td>
                <td>100</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
