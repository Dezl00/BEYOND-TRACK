import { queueOtp } from "./otp-delivery";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { compare, hash as hashPassword } from "bcryptjs";
import { cookies } from "next/headers";
import { cache } from "react";
import { db, one, rows, sql, type Executor } from "@/db";
import type { Actor } from "@/lib/domain";
import { loginPhone } from "@/lib/whatsapp-phone";
import { ar } from "@/messages/ar";
import { AppError } from "./errors";
import { hash, keyedHash, token, rateLimit, metadata } from "./security";
import { audit, authAudit, type Meta } from "./events";
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
  role_active?: boolean;
  deleted_at?: Date | null;
  otp_enabled: boolean;
  otp_exempt: boolean;
  email: string;
  username: string;
  whatsapp_number: string | null;
  theme: number;
  force_password_change: boolean;
};
export const currentActor = cache(async (): Promise<Actor | null> => {
  const value = (await cookies()).get(sessionCookie)?.value;
  if (!value || !/^[a-f0-9]{64}$/.test(value)) return null;
  const a = await one<Actor>(
    sql`SELECT u.id,u.name,u.email,u.username,u.job_title,u.role_id,u.is_owner,u.force_password_change,u.theme,u.otp_enabled,u.otp_exempt,r.name role_name,r.unit_supervisor,r.workflow_role,s.id session_id,s.expires_at,s.remember,COALESCE((SELECT json_agg(p.key) FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=u.role_id),'[]'::json) permissions FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id WHERE (s.token_hash=${hash(value)} OR (s.previous_token_hash=${hash(value)} AND s.previous_until>now())) AND s.expires_at>now() AND u.deleted_at IS NULL AND r.active=true AND (u.locked=false OR u.is_owner=true) LIMIT 1`,
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
  const phone = loginPhone(input.identifier);
  await rateLimit("login-ip", meta.ip, 20, 900);
  await rateLimit("login-account", phone ?? input.identifier, 10, 900);
  const matches = await rows<User>(
    sql`SELECT * FROM users WHERE deleted_at IS NULL AND (email=${input.identifier} OR username=${input.identifier} OR whatsapp_number=${phone}) LIMIT 2`,
  );
  // A shared phone or a numeric username collision must never select an arbitrary account.
  const u = matches.length === 1 ? matches[0] : undefined;
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
      sql`SELECT u.*,r.active role_active FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=${u.id} AND u.deleted_at IS NULL FOR UPDATE OF u`,
      tx,
    );
    if (!fresh) throw new AppError("credentials", 401);
    if (
      !valid ||
      fresh.role_active === false ||
      fresh.password_hash !== u.password_hash ||
      (fresh.email !== input.identifier &&
        fresh.username !== input.identifier &&
        (!phone || fresh.whatsapp_number !== phone)) ||
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
      const delivery = await queueOtp(
        tx,
        "login",
        challenge,
        ar.email.otpSubject,
        code,
      );
      return { challenge, whatsapp: delivery.whatsapp } as const;
    }
    return {
      session: await makeSession(tx, fresh, input.remember, meta),
    } as const;
  });
  if ("error" in result) throw new AppError("credentials", 401);
  if ("challenge" in result)
    return { challenge: result.challenge, whatsapp: result.whatsapp };
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
      sql`SELECT u.*,r.active role_active FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=${c.user_id} AND u.deleted_at IS NULL FOR UPDATE OF u`,
      tx,
    );
    if (
      !u ||
      u.role_active === false ||
      u.deleted_at ||
      (!u.is_owner && u.locked)
    )
      return null;
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
  const challenge = randomUUID();
  await db().transaction(async (tx) => {
    const user = await one<{
      id: string;
      email: string;
    }>(
      sql`SELECT u.id,u.email FROM users u JOIN roles r ON r.id=u.role_id AND r.active WHERE u.email=${email} AND u.deleted_at IS NULL AND NOT u.locked FOR UPDATE OF u`,
      tx,
    );
    if (!user) return;
    const code = String(randomInt(0, 1000000)).padStart(6, "0");
    await tx.execute(
      sql`DELETE FROM auth_challenges WHERE user_id=${user.id} AND kind=1`,
    );
    await tx.execute(
      sql`INSERT INTO auth_challenges(id,user_id,kind,token_hash,expires_at) VALUES (${challenge},${user.id},1,${keyedHash("reset:" + challenge + ":" + user.email + ":" + code)},now()+interval '5 minutes')`,
    );
    await queueOtp(tx, "reset", challenge, ar.email.resetSubject, code);
  });
  return { message: ar.auth.resetSent, challenge };
}
export async function resetPassword(
  input: z.infer<typeof resetPasswordSchema>,
) {
  const meta = await metadata();
  await rateLimit("reset-finish", meta.ip, 10, 900);
  const changed = await db().transaction(async (tx) => {
    const c = await one<{
      id: string;
      user_id: string;
      email: string;
      token_hash: string;
    }>(
      sql`SELECT c.id,c.user_id,c.token_hash,u.email FROM auth_challenges c JOIN users u ON u.id=c.user_id JOIN roles r ON r.id=u.role_id WHERE c.id=${input.challenge} AND c.kind=1 AND c.expires_at>now() AND c.attempts<5 AND u.deleted_at IS NULL AND NOT u.locked AND r.active FOR UPDATE OF u,c`,
      tx,
    );
    if (!c) return false;
    if (
      !safeCode(
        c.token_hash,
        keyedHash("reset:" + c.id + ":" + c.email + ":" + input.code),
      )
    ) {
      await tx.execute(
        sql`UPDATE auth_challenges SET attempts=attempts+1 WHERE id=${c.id}`,
      );
      return false;
    }
    const passwordHash = await hashPassword(input.password, 12);
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
    return true;
  });
  if (!changed) throw new AppError("reset", 400);
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
