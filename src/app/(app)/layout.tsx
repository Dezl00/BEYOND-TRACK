import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { currentActor } from "@/server/auth";
import { one, sql } from "@/db";
import Shell from "@/components/shell";
import { uuid } from "@/lib/validation";
import { projectScope } from "@/server/access";
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  const pathname = (await headers()).get("x-pathname");
  if (actor.force_password_change && pathname !== "/settings/security")
    redirect("/settings/security");
  const settings = await one<{ digits: number }>(
    sql`SELECT digits FROM settings WHERE id=1`,
  );
  const selected = uuid.safeParse((await headers()).get("x-project-id"));
  const project = selected.success
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
