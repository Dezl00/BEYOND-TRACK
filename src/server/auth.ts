import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { compare, hash as hashPassword } from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import { db, one, rows, sql, type Executor } from "@/db";
import type { Actor } from "@/lib/domain";
import { ar } from "@/messages/ar";
import { AppError } from "./errors";
import { hash, keyedHash, token, rateLimit, metadata } from "./security";
import { audit, authAudit, queueEmail, type Meta } from "./events";
import type { z } from "zod";
import {
  loginSchema,
  otpSchema,
  resetPasswordSchema,
  passwordChangeSchema,
} from "@/lib/validation";
export const sessionCookie =
  process.env.NODE_ENV === "production" ? "__Host-bt" : "bt-session";
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
type User = {
  id: string;
  password_hash: string;
  locked: boolean;
  locked_until: Date | null;
  failed_attempts: number;
  is_owner: boolean;
  otp_enabled: boolean;
  otp_exempt: boolean;
  email: string;
  theme: number;
  force_password_change: boolean;
};
export const currentActor = cache(async (): Promise<Actor | null> => {
  const value = (await cookies()).get(sessionCookie)?.value;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  const a = await one<Actor>(
    sql`SELECT u.id,u.name,u.email,u.username,u.job_title,u.role_id,u.is_owner,u.force_password_change,u.theme,u.otp_enabled,u.otp_exempt,r.name role_name,s.id session_id,s.expires_at,s.remember,COALESCE((SELECT json_agg(p.key) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id),'[]'::json) permissions FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id WHERE (s.token_hash=${hash(value)} OR (s.previous_token_hash=${hash(value)} AND s.previous_until>now())) AND s.expires_at>now() AND (u.locked=false OR u.is_owner=true) LIMIT 1`,
  );
  return a || null;
});
export async function requireActor(allowForced = false) {
  const a = await currentActor();
  if (!a) throw new AppError("credentials", 401);
  if (a.force_password_change && !allowForced)
    throw new AppError("forcePassword", 403);
  return a;
}
async function setSessionCookie(
  value: string,
  expires: Date,
  remember: boolean,
  theme: number,
) {
  const jar = await cookies();
  jar.set(sessionCookie, value, {
    ...cookieOptions,
    ...(remember ? { expires } : {}),
  });
  jar.set("bt-theme", String(theme), {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 365,
  });
}
async function makeSession(
  conn: Executor,
  u: User,
  remember: boolean,
  meta: Meta,
) {
  const value = token(),
    expires = new Date(
      Date.now() + (remember ? 30 * 24 * 60 * 60_000 : 60 * 60_000),
    );
  await conn.execute(
    sql`INSERT INTO sessions(user_id,token_hash,expires_at,remember,ip,user_agent) VALUES (${u.id},${hash(value)},${expires},${remember},${meta.ip},${meta.userAgent})`,
  );
  await audit(conn, u.id, meta, 4, 0, u.id);
  return {
    value,
    expires,
    remember,
    theme: u.theme,
    force: u.force_password_change,
  };
}
function safeCode(a: string, b: string) {
  return (
    a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export async function login(input: z.infer<typeof loginSchema>) {
  const meta = await metadata();
  await rateLimit("login-ip", meta.ip, 20, 900);
  await rateLimit("login-account", input.identifier, 10, 900);
  const u = await one<User>(
    sql`SELECT * FROM users WHERE email=${input.identifier} OR username=${input.identifier} LIMIT 1`,
  );
  // Constant-cost verification also for unknown identities.
  const valid = await compare(
    input.password,
    u?.password_hash ||
      "$2b$12$KBFLufQK5PMeQWyCxEHTo.eWX4O0FUY7YjZD9AnVIrf2eoW/zyE2S",
  );
  if (!u) {
    await authAudit(null, meta, 6);
    throw new AppError("credentials", 401);
  }
  const result = await db().transaction(async (tx) => {
    const fresh = await one<User>(
      sql`SELECT * FROM users WHERE id=${u.id} FOR UPDATE`,
      tx,
    );
    if (!fresh) throw new AppError("credentials", 401);
    if (
      !valid ||
      fresh.password_hash !== u.password_hash ||
      (!fresh.is_owner &&
        (fresh.locked ||
          (fresh.locked_until && new Date(fresh.locked_until) > new Date())))
    ) {
      await tx.execute(
        sql`UPDATE users SET failed_attempts=LEAST(failed_attempts+1,100),locked_until=CASE WHEN failed_attempts>=4 AND is_owner=false THEN now()+interval '15 minutes' ELSE locked_until END WHERE id=${u.id}`,
      );
      await audit(tx, u.id, meta, 6, 0, u.id);
      return { error: true } as const;
    }
    await tx.execute(
      sql`UPDATE users SET failed_attempts=0,locked_until=null WHERE id=${u.id}`,
    );
    const global = await one<{ otp_required: boolean }>(
      sql`SELECT otp_required FROM settings WHERE id=1`,
      tx,
    );
    if ((global?.otp_required && !fresh.otp_exempt) || fresh.otp_enabled) {
      if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)
        throw new AppError("configured", 503);
      const challenge = randomUUID(),
        code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await tx.execute(
        sql`DELETE FROM auth_challenges WHERE user_id=${u.id} AND kind=0`,
      );
      await tx.execute(
        sql`INSERT INTO auth_challenges(id,user_id,kind,token_hash,remember,expires_at) VALUES (${challenge},${u.id},0,${keyedHash(`${challenge}:${code}`)},${input.remember},now()+interval '5 minutes')`,
      );
      await queueEmail(
        tx,
        u.email,
        ar.email.otpSubject,
        `<html lang="ar" dir="rtl"><body><p>${ar.email.otpBody}</p><p dir="ltr">${code}</p><p>${ar.email.otpExpiry}</p></body></html>`,
      );
      return { challenge } as const;
    }
    return {
      session: await makeSession(tx, fresh, input.remember, meta),
    } as const;
  });
  if ("error" in result) throw new AppError("credentials", 401);
  if ("challenge" in result) return { challenge: result.challenge };
  await setSessionCookie(
    result.session.value,
    result.session.expires,
    result.session.remember,
    result.session.theme,
  );
  return {
    redirect: result.session.force ? "/settings/security" : "/dashboard",
  };
}
export async function verifyOtp(input: z.infer<typeof otpSchema>) {
  const meta = await metadata();
  await rateLimit("otp-ip", meta.ip, 25, 900);
  const result = await db().transaction(async (tx) => {
    const c = await one<{
      id: string;
      user_id: string;
      token_hash: string;
      remember: boolean;
      attempts: number;
    }>(
      sql`SELECT * FROM auth_challenges WHERE id=${input.challenge} AND kind=0 AND expires_at>now() FOR UPDATE`,
      tx,
    );
    if (!c || c.attempts >= 5) return null;
    await tx.execute(
      sql`UPDATE auth_challenges SET attempts=attempts+1 WHERE id=${c.id}`,
    );
    if (!safeCode(c.token_hash, keyedHash(`${c.id}:${input.code}`))) {
      await audit(tx, c.user_id, meta, 6, 0, c.user_id);
      return null;
    }
    const u = await one<User>(
      sql`SELECT * FROM users WHERE id=${c.user_id} FOR UPDATE`,
      tx,
    );
    if (!u || (!u.is_owner && u.locked)) return null;
    await tx.execute(sql`DELETE FROM auth_challenges WHERE id=${c.id}`);
    return makeSession(tx, u, c.remember, meta);
  });
  if (!result) throw new AppError("otp", 401);
  await setSessionCookie(
    result.value,
    result.expires,
    result.remember,
    result.theme,
  );
  return { redirect: result.force ? "/settings/security" : "/dashboard" };
}
export async function forgotPassword(email: string) {
  const meta = await metadata();
  await rateLimit("reset-ip", meta.ip, 5, 900);
  await rateLimit("reset-account", email, 3, 900);
  const u = await one<User>(
    sql`SELECT * FROM users WHERE email=${email} AND locked=false`,
  );
  if (u && process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
    await db().transaction(async (tx) => {
      const value = token();
      await tx.execute(
        sql`DELETE FROM auth_challenges WHERE user_id=${u.id} AND kind=1`,
      );
      await tx.execute(
        sql`INSERT INTO auth_challenges(user_id,kind,token_hash,expires_at) VALUES (${u.id},1,${hash(value)},now()+interval '30 minutes')`,
      );
      const link = new URL(
        "/login",
        process.env.APP_URL || "http://localhost:3000",
      );
      link.searchParams.set("reset", value);
      await queueEmail(
        tx,
        u.email,
        ar.email.resetSubject,
        `<html lang="ar" dir="rtl"><body><a href="${link.toString()}">${ar.email.resetBody}</a><p>${ar.email.resetExpiry}</p></body></html>`,
      );
    });
  return { message: ar.auth.resetSent };
}
export async function resetPassword(
  input: z.infer<typeof resetPasswordSchema>,
) {
  const meta = await metadata();
  await rateLimit("reset-finish", meta.ip, 10, 900);
  const passwordHash = await hashPassword(input.password, 12);
  await db().transaction(async (tx) => {
    const c = await one<{ user_id: string }>(
      sql`DELETE FROM auth_challenges WHERE token_hash=${hash(input.token)} AND kind=1 AND expires_at>now() RETURNING user_id`,
      tx,
    );
    if (!c) throw new AppError("reset", 400);
    await tx.execute(
      sql`UPDATE users SET password_hash=${passwordHash},force_password_change=false,failed_attempts=0,locked_until=null WHERE id=${c.user_id}`,
    );
    await tx.execute(sql`DELETE FROM sessions WHERE user_id=${c.user_id}`);
    await tx.execute(
      sql`DELETE FROM auth_challenges WHERE user_id=${c.user_id}`,
    );
    await audit(tx, c.user_id, meta, 12, 0, c.user_id, {
      password: { changed: true },
    });
  });
  return { message: ar.auth.resetDone };
}
export async function changePassword(
  a: Actor,
  input: z.infer<typeof passwordChangeSchema>,
) {
  const meta = await metadata();
  await rateLimit("password", a.id, 5, 900);
  const u = await one<User>(sql`SELECT * FROM users WHERE id=${a.id}`);
  if (!u || !(await compare(input.current, u.password_hash)))
    throw new AppError("credentials", 401);
  const passwordHash = await hashPassword(input.password, 12);
  await db().transaction(async (tx) => {
    const updated = await one(
      sql`UPDATE users SET password_hash=${passwordHash},force_password_change=false WHERE id=${a.id} AND password_hash=${u.password_hash} RETURNING id`,
      tx,
    );
    if (!updated) throw new AppError("conflict", 409);
    await tx.execute(
      sql`DELETE FROM sessions WHERE user_id=${a.id} AND id<>${a.session_id}`,
    );
    await tx.execute(sql`DELETE FROM auth_challenges WHERE user_id=${a.id}`);
    await audit(tx, a.id, meta, 1, 0, a.id, { password: { changed: true } });
  });
  return { redirect: "/dashboard" };
}
export async function logout() {
  const a = await currentActor();
  if (a)
    await db().transaction(async (tx) => {
      await tx.execute(sql`DELETE FROM sessions WHERE id=${a.session_id}`);
      await audit(tx, a.id, await metadata(), 5, 9, a.session_id);
    });
  (await cookies()).delete(sessionCookie);
}
export async function rotate(a: Actor) {
  const jar = await cookies(),
    value = jar.get(sessionCookie)?.value;
  if (!value) throw new AppError("credentials", 401);
  const next = token();
  const r = await one<{ expires_at: Date }>(
    sql`UPDATE sessions SET previous_token_hash=token_hash,previous_until=now()+interval '30 seconds',token_hash=${hash(next)},rotated_at=now() WHERE id=${a.session_id} AND token_hash=${hash(value)} AND rotated_at<now()-interval '15 minutes' RETURNING expires_at`,
  );
  if (r)
    await setSessionCookie(next, new Date(r.expires_at), a.remember, a.theme);
  return { expiresAt: a.expires_at };
}
