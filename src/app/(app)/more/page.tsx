import { requestLanguage } from "@/server/language";
import { requirePageActor } from "@/server/page-auth";
import { Heading } from "@/components/common";
import MoreNavigation from "@/components/more-navigation";

export default async function MorePage() {
  const { m: msg } = await requestLanguage();
  
  const actor = await requirePageActor();
  return (
    <>
      <Heading title={msg.nav.more} />
      <MoreNavigation actor={actor} />
    </>
  );
}
