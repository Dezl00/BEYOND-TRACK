import { canManageUnits } from "@/lib/domain";
import { requirePageActor } from "@/server/page-auth";
import { requirePermission } from "@/server/access";
import { listQuerySchema } from "@/lib/validation";
import { ar } from "@/messages/ar";
import { Heading } from "@/components/common";
import ImportForm from "@/components/import-form";
import BoqTabs from "@/components/boq-tabs";
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const a = await requirePageActor();
  requirePermission(a, "boq.create");
  const q = listQuerySchema.parse(await searchParams);
  return (
    <>
      <Heading title={ar.boq.importTitle} />
      <BoqTabs
        current="import"
        project={q.project}
        canImport
        canUnits={canManageUnits(a)}
      />
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
                {[
                  ar.seed.sampleMain,
                  ar.seed.sampleSecondary,
                  ar.seed.sampleSub,
                  ar.seed.sampleMaterial,
                  ar.seed.units[2][0],
                ].map((cell, i) => (
                  <td key={i}>{cell}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
