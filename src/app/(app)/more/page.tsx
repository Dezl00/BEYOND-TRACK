import { requirePageActor } from "@/server/page-auth";
import { Heading } from "@/components/common";
import MoreNavigation from "@/components/more-navigation";
import { ar } from "@/messages/ar";
export default async function MorePage() {
  const actor = await requirePageActor();
  return (
    <>
      <Heading title={ar.nav.more} />
      <MoreNavigation actor={actor} />
    </>
  );
}
