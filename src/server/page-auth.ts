import { headers } from "next/headers";
import { loginPath } from "@/lib/request-links";
import { redirect } from "next/navigation";
import { currentActor } from "./auth";

// Pages and their shared layout can render independently. Redirect expected
// authentication states in each page before querying protected application data.
// API routes keep using requireActor so they return 401/403 JSON responses.
export async function requirePageActor(allowForced = false) {
  const actor = await currentActor();
  if (!actor) redirect(loginPath((await headers()).get("x-pathname")));
  if (actor.force_password_change && !allowForced)
    redirect("/settings/security");
  return actor;
}
