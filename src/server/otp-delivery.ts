import { db, one, sql, type Executor } from "@/db";
import { whatsappRecipient } from "@/lib/whatsapp-phone";
import { ar } from "@/messages/ar";
import { otpEmail } from "./email-templates";
import { queueEmail } from "./events";
import { encrypt } from "./security";
import { AppError } from "./errors";

type OtpPurpose = "login" | "reset" | "purge";
export function isOtpKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    /^(login|reset|purge):[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(
      key,
    )
  );
}

export async function otpRecipient(key: string, conn: Executor = db()) {
  if (!isOtpKey(key)) return null;
  const [purpose, challenge] = key.split(":");
  const source =
    purpose === "purge"
      ? sql`request_purge_challenges c JOIN sessions session ON session.id=c.session_id AND session.user_id=c.user_id AND session.expires_at>now()`
      : sql`auth_challenges c`;
  const scope =
    purpose === "purge"
      ? sql`u.is_owner AND c.verified_at IS NULL`
      : sql`c.kind=${purpose === "login" ? 0 : 1}`;
  const account = await one<{
    email: string;
    country: string;
    phone: string | null;
  }>(
    sql`SELECT u.email,u.whatsapp_country_code country,CASE WHEN s.whatsapp_enabled AND u.whatsapp_enabled THEN u.whatsapp_number END phone
        FROM ${source} JOIN users u ON u.id=c.user_id JOIN roles r ON r.id=u.role_id CROSS JOIN settings s
        WHERE s.id=1 AND c.id=${challenge} AND c.expires_at>now() AND c.attempts<5 AND ${scope}
        AND r.active AND u.deleted_at IS NULL AND (NOT u.locked OR (u.is_owner AND ${purpose === "login"}))`,
    conn,
  );
  return account
    ? {
        email: account.email,
        phone: whatsappRecipient(account.country, account.phone ?? ""),
      }
    : null;
}

export async function queueOtp(
  conn: Executor,
  purpose: OtpPurpose,
  challenge: string,
  subject: string,
  code: string,
) {
  const key = purpose + ":" + challenge;
  const account = await otpRecipient(key, conn);
  if (!account) throw new AppError("forbidden", 403);
  await queueEmail(conn, account.email, subject, otpEmail(subject, code), key);
  if (account.phone) {
    const text = ["*" + subject + "*", code, ar.email.otpExpiry].join("\n\n");
    const payload = {
      otpKey: key,
      key: "wa-" + key,
      encrypted: encrypt({ to: account.phone, text }),
    };
    await conn.execute(
      sql`INSERT INTO outbox(kind,payload) VALUES(5,${JSON.stringify(payload)}::jsonb)`,
    );
  }
  return { email: account.email, whatsapp: !!account.phone };
}
