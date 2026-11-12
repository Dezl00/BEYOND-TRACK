import type { ar } from "./ar";
type Widen<T> = T extends string ? string : { readonly [K in keyof T]: Widen<T[K]> };
export type MessageCatalog = Widen<typeof ar>;
export type Locale = "ar" | "en";
export const parseLocale = (value: unknown): Locale => value === "en" ? "en" : "ar";
