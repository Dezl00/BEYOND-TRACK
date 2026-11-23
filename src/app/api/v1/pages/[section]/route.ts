import { requireActor } from "@/server/auth";
import { requirePermission } from "@/server/access";
import { AppError, errorResponse } from "@/server/errors";
import { listQuerySchema } from "@/lib/validation";
import { reportQuerySchema } from "@/lib/reporting";
import { permittedNavigation } from "@/lib/navigation";
import {
  can,
  modules,
  actionsForModule,
  specialPermissions,
  requestModules,
  canManageUnits,
} from "@/lib/domain";
import {
  auditList,
  dashboard,
  listRequests,
  listResource,
  notifications,
  page,
  decodeCursor,
} from "@/server/queries";
import {
  reportContext,
  reportOptions,
  reportOverview,
  consumptionPage,
} from "@/server/reports";
import { currentSettings } from "@/server/settings";
import { one, rows, sql } from "@/db";
import { whatsappConfigured } from "@/server/whatsapp-gateway";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ section: string }> },
) {
  try {
    const { section } = await params;
    const actor = await requireActor(["me", "security"].includes(section));
    const raw = Object.fromEntries(new URL(req.url).searchParams);
    const json = (value: unknown) =>
      Response.json(value, {
        headers: { "Cache-Control": "private, no-store" },
      });
    if (section === "me") {
      const {
        id,
        username,
        name,
        email,
        job_title,
        role_id,
        role_name,
        workflow_role,
        is_owner,
        force_password_change,
        theme,
        locale,
      } = actor;
      const catalog = [
        ...modules.flatMap((m) => actionsForModule(m).map((a) => m + "." + a)),
        ...specialPermissions,
      ];
      return json({
        id,
        username,
        name,
        email,
        job_title,
        role_id,
        role_name,
        workflow_role,
        is_owner,
        force_password_change,
        theme,
        locale,
        permissions: catalog.filter((p) => can(actor, p)),
        permissionCatalog: catalog,
        canManageUnits: canManageUnits(actor),
        navigation: permittedNavigation(actor),
      });
    }
    if (section === "reports") {
      const q = reportQuerySchema.parse(raw);
      if (!q.project)
        return json(await reportOptions(actor, "report-projects", q));
      const query = { ...q, project: q.project };
      const [context, overview, data] = await Promise.all([
        reportContext(actor, query),
        reportOverview(actor, query),
        consumptionPage(actor, query),
      ]);
      return json({ context, overview, data });
    }
    const q = listQuerySchema.parse(raw);
    switch (section) {
      case "dashboard":
        return json(await dashboard(actor, q.project));
      case "audit":
        return json(await auditList(actor, q));
      case "notifications":
        requirePermission(actor, "requests.view");
        return json(
          await notifications(
            actor,
            q.cursor,
            q.q,
            actor.locale === "en" ? "en" : "ar",
          ),
        );
      case "appearance": {
        const settings = await currentSettings();
        return json({
          theme: actor.theme,
          locale: actor.locale,
          digits: settings?.digits,
          defaultTheme: settings?.default_theme,
        });
      }
      case "system":
        requirePermission(actor, "settings.edit");
        return json({
          settings: await one(
            sql`SELECT otp_required,default_theme,digits,read_notification_days,whatsapp_enabled FROM settings WHERE id=1`,
          ),
          policies: await rows(
            sql`SELECT type,in_app,email,whatsapp,forced FROM notification_policy ORDER BY type`,
          ),
        });
      case "notification-preferences":
        return json({
          preferences: await rows(
            sql`SELECT type,in_app,email,whatsapp FROM notification_preferences WHERE user_id=${actor.id} ORDER BY type`,
          ),
          policies: await rows(
            sql`SELECT type,in_app,email,whatsapp,forced FROM notification_policy ORDER BY type`,
          ),
          account: await one(
            sql`SELECT whatsapp_country_code,whatsapp_number,whatsapp_enabled FROM users WHERE id=${actor.id}`,
          ),
          whatsappConfigured: whatsappConfigured(),
        });
      case "security": {
        const cursor = decodeCursor(q.cursor);
        const sessions = await rows<{ id: string }>(
          sql`SELECT id,ip,user_agent,created_at,expires_at FROM sessions WHERE user_id=${actor.id} AND expires_at>now() ${cursor ? sql`AND id>${cursor.id}::uuid` : sql``} ORDER BY id LIMIT 26`,
        );
        return json({
          sessions: page(sessions),
          current: actor.session_id,
          otpEnabled: actor.otp_enabled,
          otpExempt: actor.otp_exempt,
        });
      }
    }
    if (section === "requests" || requestModules.some((m) => m === section))
      return json(await listRequests(actor, q, section));
    if (section === "units" && !canManageUnits(actor))
      throw new AppError("forbidden", 403);
    if (
      [
        "units",
        "materials",
        "boq",
        "projects",
        "roles",
        "users",
        "suppliers",
      ].includes(section)
    )
      return json(await listResource(actor, section, q));
    throw new AppError("notFound", 404);
  } catch (error) {
    return errorResponse(error, req);
  }
}
