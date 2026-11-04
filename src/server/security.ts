import {
  createHash,
  createHmac,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { headers } from "next/headers";
import { sql, one } from "@/db";
import { AppError } from "./errors";
export function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new AppError("configured", 503);
  return s;
}
export const token = () => randomBytes(32).toString("hex");
export const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const keyedHash = (value: string) =>
  createHmac("sha256", secret()).update(value).digest("hex");
export function encrypt(value: unknown) {
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(hash(secret()), "hex"),
      iv,
    );
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function decrypt<T>(value: string): T {
  const [iv, tag, data] = value.split(".");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(hash(secret()), "hex"),
    Buffer.from(iv, "base64url"),
  );
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(data, "base64url")),
      cipher.final(),
    ]).toString("utf8"),
  ) as T;
}
export async function metadata() {
  const h = await headers();
  return {
    ip: (
      h.get("x-vercel-forwarded-for")?.split(",")[0] ||
      (process.env.NODE_ENV === "production"
        ? "unknown"
        : h.get("x-forwarded-for")?.split(",")[0]) ||
      "local"
    )
      .trim()
      .slice(0, 64),
    userAgent: (h.get("user-agent") || "").slice(0, 500),
  };
}
export function csrf(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError("forbidden", 403);
  try {
    const source = new URL(origin),
      destination = new URL(request.url);
    const authority = request.headers.get("host") || destination.host;
    // Host is browser-controlled and preserved by our deployment. Do not trust
    // client-supplied Forwarded / X-Forwarded-Host values or allow domain suffixes.
    if (!/^(?:\[[a-f0-9:.]+\]|[a-z0-9.-]+)(?::\d{1,5})?$/i.test(authority))
      throw new Error("Invalid target host");
    const target = new URL(`${destination.protocol}//${authority}`);
    const loopback =
      target.hostname === "localhost" ||
      target.hostname === "[::1]" ||
      /^127(?:\.\d{1,3}){3}$/.test(target.hostname);
    // Vercel terminates TLS before forwarding requests to the Next.js server.
    if (process.env.NODE_ENV === "production" && !loopback)
      target.protocol = "https:";
    if (
      !["http:", "https:"].includes(source.protocol) ||
      source.origin !== origin ||
      source.origin !== target.origin
    )
      throw new Error("Cross-origin request");
  } catch {
    throw new AppError("forbidden", 403);
  }
}
export async function rateLimit(
  namespace: string,
  key: string,
  limit: number,
  seconds: number,
) {
  const k = `${namespace}:${keyedHash(key)}`;
  const r = await one<{ count: number }>(
    sql`INSERT INTO rate_limits (key,count,expires_at) VALUES (${k},1,now()+${seconds}*interval '1 second') ON CONFLICT (key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END, expires_at=CASE WHEN rate_limits.expires_at<now() THEN EXCLUDED.expires_at ELSE rate_limits.expires_at END RETURNING count`,
  );
  if (!r || r.count > limit) throw new AppError("rate", 429);
}
