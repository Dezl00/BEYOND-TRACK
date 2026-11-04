import { currentSettings } from "@/server/settings";
import { headers } from "next/headers";
import { requirePageActor } from "@/server/page-auth";
import { one, sql } from "@/db";
import Shell from "@/components/shell";
import { uuid } from "@/lib/validation";
import { projectScope } from "@/server/access";
import { can } from "@/lib/domain";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname");
  const actor = await requirePageActor(pathname === "/settings/security");
  const selected = uuid.safeParse((await headers()).get("x-project-id"));
  const [settings, context] = await Promise.all([
    currentSettings(),
    !actor.force_password_change && can(actor, "projects.view")
      ? one<{
          name: string | null;
          choices: { id: string; name: string }[];
        }>(sql`SELECT
          (SELECT p.name FROM projects p WHERE p.id=${selected.success ? selected.data : null}::uuid AND ${projectScope(actor)}) name,
          COALESCE((SELECT json_agg(choice) FROM (SELECT p.id,p.name FROM projects p WHERE p.archived=false AND ${projectScope(actor)} ORDER BY p.name,p.id LIMIT 2) choice),'[]'::json) choices`)
      : Promise.resolve(null),
  ]);
  return (
    <Shell
      actor={actor}
      digits={settings?.digits || 0}
      projectName={context?.name || undefined}
      projectChoices={context?.choices || []}
    >
      {children}
    </Shell>
  );
}
