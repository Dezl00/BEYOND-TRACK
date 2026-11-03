import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import WebSocket from "ws";
import { sql, type SQL } from "drizzle-orm";
import * as schema from "./schema";
neonConfig.webSocketConstructor = WebSocket;
let instance: ReturnType<typeof drizzle<typeof schema>> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return (instance ??= drizzle(
    new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      idleTimeoutMillis: 15_000,
      connectionTimeoutMillis: 10_000,
    }),
    { schema },
  ));
}
export type Executor = Pick<ReturnType<typeof db>, "execute">;
export async function rows<T>(query: SQL, conn: Executor = db()): Promise<T[]> {
  return (await conn.execute(query)).rows as T[];
}
export async function one<T>(
  query: SQL,
  conn: Executor = db(),
): Promise<T | undefined> {
  return (await rows<T>(query, conn))[0];
}
export { sql };
