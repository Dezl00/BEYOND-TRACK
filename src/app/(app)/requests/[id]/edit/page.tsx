import { requirePageActor } from "@/server/page-auth";
import { requirePermission } from "@/server/access";
import { requestDetail } from "@/server/queries";
import { uuid } from "@/lib/validation";
import { editable } from "@/lib/domain";
import { AppError } from "@/server/errors";
import { ar } from "@/messages/ar";
import { Heading } from "@/components/common";
import RequestForm from "@/components/request-form";
export default async function EditRequest({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const a = await requirePageActor();
  requirePermission(a, "requests.edit");
  const id = uuid.parse((await params).id),
    r = await requestDetail(a, id);
  if (
    !a.is_owner &&
    (r.created_by !== a.id || !editable(r.submitted_at, r.status))
  )
    throw new AppError("editExpired", 403);
  return (
    <>
      <Heading title={ar.common.edit} />
      <RequestForm initial={r} />
    </>
  );
}
