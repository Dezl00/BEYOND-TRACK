import { requirePageActor } from "@/server/page-auth";
import { requirePermission } from "@/server/access";
import { listQuerySchema } from "@/lib/validation";
import { ar } from "@/messages/ar";
import { Heading } from "@/components/common";
import RequestForm from "@/components/request-form";
export default async function NewRequest({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const a = await requirePageActor();
  requirePermission(a, "requests.create");
  const q = listQuerySchema.parse(await searchParams);
  return (
    <>
      <Heading title={ar.requests.new} />
      <RequestForm project={q.project} />
    </>
  );
}
