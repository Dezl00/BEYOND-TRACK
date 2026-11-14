import { requestLanguage } from "@/server/language";
import { canManageUnits } from "@/lib/domain";
import { requirePageActor } from "@/server/page-auth";
import { requirePermission } from "@/server/access";
import { listQuerySchema } from "@/lib/validation";

import { Heading } from "@/components/common";
import ImportForm from "@/components/import-form";
import BoqTabs from "@/components/boq-tabs";
import { Download } from "lucide-react";
export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { m: msg } = await requestLanguage();

  const a = await requirePageActor();
  requirePermission(a, "boq.create");
  const q = listQuerySchema.parse(await searchParams);
  return (
    <>
      <Heading title={msg.boq.importTitle}>
        <a href="/api/import" className="btn small import-template-link">
          <Download size={17} strokeWidth={1.8} />
          {msg.common.template}
        </a>
      </Heading>
      <BoqTabs
        current="import"
        project={q.project}
        canImport
        canUnits={canManageUnits(a)}
      />
      <section className="panel panel-body import-panel">
        <ImportForm project={q.project} />
      </section>
    </>
  );
}
