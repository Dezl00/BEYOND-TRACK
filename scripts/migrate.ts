import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { db, sql, one } from "../src/db";
export async function migrate() {
  await db().execute(
    sql`CREATE TABLE IF NOT EXISTS migration_history(name text PRIMARY KEY,hash text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())`,
  );
  for (const folder of ["drizzle/generated", "drizzle/custom"])
    for (const name of (await readdir(folder))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      const content = await readFile(`${folder}/${name}`, "utf8"),
        checksum = createHash("sha256").update(content).digest("hex"),
        key = `${folder}/${name}`;
      await db().transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(741291)`);
        const previous = await one<{ hash: string }>(
          sql`SELECT hash FROM migration_history WHERE name=${key}`,
          tx,
        );
        if (previous) {
          if (previous.hash !== checksum)
            throw new Error(`Migration changed: ${key}`);
          return;
        }
        for (const statement of content
          .split("--> statement-breakpoint")
          .filter((s) => s.trim()))
          await tx.execute(sql.raw(statement));
        await tx.execute(
          sql`INSERT INTO migration_history(name,hash) VALUES (${key},${checksum})`,
        );
      });
      console.log(`Applied: ${key}`);
    }
}
migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      "Migration failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exit(1);
  });
