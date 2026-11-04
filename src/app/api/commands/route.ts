import { after } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import * as v from "@/lib/validation";
import { requireActor, changePassword } from "@/server/auth";
import { csrf, metadata, rateLimit } from "@/server/security";
import { errorResponse, AppError } from "@/server/errors";
import * as requests from "@/server/requests";
import * as admin from "@/server/admin";
import { processJobs } from "@/server/jobs";
import { db, sql } from "@/db";
import { deleteSchema, deleteRecord } from "@/server/delete";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    csrf(req);
    const { command, data } = z
      .object({ command: z.string().max(40), data: z.unknown() })
      .parse(await req.json());
    const a = await requireActor(
        command === "password" || command === "revoke-session",
      ),
      m = await metadata();
    await rateLimit("commands", a.id, 120, 60);
    let result: unknown;
    switch (command) {
      case "delete":
        result = await deleteRecord(a, deleteSchema.parse(data), m);
        break;
      case "request":
        result = await requests.saveRequest(a, v.requestSchema.parse(data), m);
        break;
      case "transition":
        result = await requests.transitionRequest(
          a,
          v.transitionSchema.parse(data),
          m,
        );
        break;
      case "order":
        result = await requests.placeOrder(a, v.orderSchema.parse(data), m);
        break;
      case "receipt":
        result = await requests.receive(a, v.receiptSchema.parse(data), m);
        break;
      case "overage":
        result = await requests.approveOverage(
          a,
          z.object({ id: v.uuid }).parse(data).id,
          m,
        );
        break;
      case "project":
        result = await admin.saveProject(a, v.projectSchema.parse(data), m);
        break;
      case "boq":
        result = await admin.saveBoq(a, v.boqSchema.parse(data), m);
        break;
      case "material":
        result = await admin.saveMaterial(a, v.materialSchema.parse(data), m);
        break;
      case "supplier":
        result = await admin.saveSupplier(a, v.supplierSchema.parse(data), m);
        break;
      case "unit":
        result = await admin.saveUnit(a, v.unitSchema.parse(data), m);
        break;
      case "user":
        result = await admin.saveUser(a, v.userSchema.parse(data), m);
        break;
      case "role":
        result = await admin.saveRole(a, v.roleSchema.parse(data), m);
        break;
      case "settings":
        result = await admin.saveSettings(a, v.settingsSchema.parse(data), m);
        break;
      case "preferences": {
        const parsed = v.preferencesSchema.parse(data);
        result = await admin.savePreferences(a, parsed, m);
        (await cookies()).set("bt-theme", String(parsed.theme), {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 31536000,
        });
        break;
      }
      case "password":
        result = await changePassword(a, v.passwordChangeSchema.parse(data));
        break;
      case "revoke-session":
        result = await admin.revokeSession(
          a,
          z.object({ id: v.uuid }).parse(data).id,
          m,
        );
        break;
      case "notification-read": {
        const p = z.object({ id: v.uuid.optional() }).parse(data);
        await db().execute(
          sql`UPDATE notifications SET read_at=now() WHERE user_id=${a.id} AND read_at IS NULL ${p.id ? sql`AND id=${p.id}` : sql``}`,
        );
        result = {};
        break;
      }
      default:
        throw new AppError("notFound", 404);
    }
    after(async () => {
      try {
        await processJobs(50);
      } catch {
        console.error("Background queue unavailable");
      }
    });
    return Response.json(result);
  } catch (e) {
    return errorResponse(e);
  }
}
