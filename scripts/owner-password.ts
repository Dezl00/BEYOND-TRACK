// Recovery command for the database owner. No public recovery endpoint exists.
import { hash } from "bcryptjs";
import { db, one, sql } from "../src/db";
import { password } from "../src/lib/validation";
import { audit } from "../src/server/events";
async function main() {
  const value = password.parse(process.env.SEED_ADMIN_PASSWORD);
  const passwordHash = await hash(value, 12);
  await db().transaction(async (tx) => {
    const owner = await one<{ id: string }>(
      sql`SELECT id FROM users WHERE is_owner=true FOR UPDATE`,
      tx,
    );
    if (!owner) throw new Error("Owner account has not been seeded");
    await tx.execute(
      sql`UPDATE users SET password_hash=${passwordHash},force_password_change=true,failed_attempts=0,locked_until=null WHERE id=${owner.id}`,
    );
    await tx.execute(sql`DELETE FROM sessions WHERE user_id=${owner.id}`);
    await tx.execute(
      sql`DELETE FROM auth_challenges WHERE user_id=${owner.id}`,
    );
    await audit(
      tx,
      owner.id,
      { ip: "local", userAgent: "owner-password-recovery" },
      12,
      0,
      owner.id,
      { password: { changed: true } },
    );
  });
  console.log(
    "Owner password set. Existing sessions revoked. First-login password change required.",
  );
}
main()
  .then(() => process.exit(0))
  .catch(() => {
    console.error(
      "Owner password reset failed. Check environment configuration and password policy.",
    );
    process.exit(1);
  });
