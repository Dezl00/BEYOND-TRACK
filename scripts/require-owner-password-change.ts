import { db, sql, one } from "../src/db";
import { audit } from "../src/server/events";
await db().transaction(async (tx) => {
  const owner = await one<{ id: string }>(
    sql`SELECT id FROM users WHERE is_owner=true FOR UPDATE`,
    tx,
  );
  if (!owner) throw new Error("Owner is missing");
  await tx.execute(
    sql`UPDATE users SET force_password_change=true WHERE id=${owner.id}`,
  );
  await tx.execute(sql`DELETE FROM sessions WHERE user_id=${owner.id}`);
  await audit(
    tx,
    owner.id,
    { ip: "local", userAgent: "verification" },
    8,
    0,
    owner.id,
    { force_password_change: { after: true } },
  );
});
console.log("Owner password change required. Verification sessions revoked.");
process.exit(0);
