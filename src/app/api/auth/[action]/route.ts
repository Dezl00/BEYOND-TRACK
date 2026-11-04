import { after } from "next/server";
import { z } from "zod";
import {
  loginSchema,
  otpSchema,
  resetSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import {
  login,
  verifyOtp,
  forgotPassword,
  resetPassword,
  logout,
  rotate,
  requireActor,
} from "@/server/auth";
import { csrf } from "@/server/security";
import { errorResponse, AppError } from "@/server/errors";
import { processJobs } from "@/server/jobs";
export const maxDuration = 60;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  try {
    csrf(req);
    const { action } = await params;
    let result: unknown;
    const input = await req.json();
    if (action === "login") result = await login(loginSchema.parse(input));
    else if (action === "otp") result = await verifyOtp(otpSchema.parse(input));
    else if (action === "forgot")
      result = await forgotPassword(resetSchema.parse(input).email);
    else if (action === "reset")
      result = await resetPassword(resetPasswordSchema.parse(input));
    else if (action === "logout") {
      z.object({}).strict().parse(input);
      await logout();
      result = { redirect: "/login" };
    } else if (action === "rotate") {
      z.object({}).strict().parse(input);
      result = await rotate(await requireActor(true));
    } else throw new AppError("notFound", 404);
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
