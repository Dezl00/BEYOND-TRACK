import { cookies } from "next/headers";
import { cache } from "react";
import { language } from "@/messages/catalog";
import { parseLocale } from "@/messages/types";
export const requestLanguage = cache(async () => language(parseLocale((await cookies()).get("bt-locale")?.value)));
