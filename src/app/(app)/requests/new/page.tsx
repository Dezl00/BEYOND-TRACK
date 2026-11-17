import { requestLanguage } from "@/server/language";
import { requirePageActor } from "@/server/page-auth";
import { requirePermission, requireProject } from "@/server/access";
import { listQuerySchema } from "@/lib/validation";

import { Heading } from "@/components/common";
import RequestForm from "@/components/request-form";
export default async function NewRequest({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const { m: msg } = await requestLanguage();
  
  const a = await requirePageActor();
  requirePermission(a, "requests.create");
  const q = listQuerySchema.parse(await searchParams);
  const project = q.project ? await requireProject(a, q.project) : undefined;
  return (
    <>
      <Heading title={msg.requests.new} />
      <RequestForm project={project?.id} projectName={project?.name} />
    </>
  );
}
