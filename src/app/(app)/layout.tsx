import { currentSettings } from "@/server/settings";
import { headers } from "next/headers";
import { requirePageActor } from "@/server/page-auth";
import { one, sql } from "@/db";
import Shell from "@/components/shell";
import { uuid } from "@/lib/validation";
import { projectScope } from "@/server/access";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = (await headers()).get("x-pathname");
  const actor = await requirePageActor(pathname === "/settings/security");
  const settings = await currentSettings();
  const selected = uuid.safeParse((await headers()).get("x-project-id"));
  const project =
    selected.success && !actor.force_password_change
      ? await one<{ name: string }>(
          sql`SELECT p.name FROM projects p WHERE p.id=${selected.data} AND ${projectScope(actor)}`,
        )
      : null;
  return (
    <Shell
      actor={actor}
      digits={settings?.digits || 0}
      projectName={project?.name}
    >
      {children}
    </Shell>
  );
}
