import { cache } from "react";
import { one, sql } from "@/db";
// Deduplicate the shell and page reads within one server render, without
// sharing authenticated data between users or caching settings across requests.
export const currentSettings = cache(() =>
  one<{
    otp_required: boolean;
    default_theme: number;
    digits: number;
    read_notification_days: number;
  }>(sql`SELECT * FROM settings WHERE id=1`),
);
