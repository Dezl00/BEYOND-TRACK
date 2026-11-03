import { ZodError } from "zod";
import { ar } from "@/messages/ar";
export class AppError extends Error {
  constructor(
    public code: keyof typeof ar.errors,
    public status = 400,
  ) {
    super(ar.errors[code]);
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof AppError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError)
    return Response.json(
      { error: error.issues[0]?.message || ar.errors.invalid },
      { status: 422 },
    );
  const code =
    (error as { code?: string; cause?: { code?: string } })?.code ||
    (error as { cause?: { code?: string } })?.cause?.code;
  if (code === "23505")
    return Response.json({ error: ar.errors.duplicate }, { status: 409 });
  if (code === "23503")
    return Response.json({ error: ar.errors.referenced }, { status: 409 });
  if (code === "23514" || code === "P0001")
    return Response.json({ error: ar.errors.invalid }, { status: 422 });
  console.error("Request failed", {
    name: error instanceof Error ? error.name : "Unknown",
    code,
  });
  return Response.json({ error: ar.errors.service }, { status: 503 });
}
