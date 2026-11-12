import { ar } from "./ar";
import { en } from "./en";
import { unitLabel } from "./units";
import type { Locale, MessageCatalog } from "./types";
import { date as formatDate, number as formatNumber } from "@/lib/format";
export function language(locale: Locale) {
 const m: MessageCatalog = locale === "en" ? en : ar;
 return {
  locale, dir: locale === "en" ? "ltr" as const : "rtl" as const, m,
  intl: (digits=0) => locale === "en" ? "en-GB" : "ar-SA-u-ca-gregory-nu-"+(digits ? "arab" : "latn"),
  date: (v: Date|string, digits=0, time=false) => formatDate(v,digits,time,locale),
  number: (v: string|number, digits=0, scale=3) => formatNumber(v,digits,scale,locale),
  percent: (v: string|number, digits=0) => new Intl.NumberFormat(locale==="en" ? "en-GB" : digits ? "ar-SA-u-nu-arab" : "ar-SA-u-nu-latn",{style:"percent",maximumFractionDigits:2}).format(Number(v)/100),
  unit: (value: unknown, symbol=false) => unitLabel(value,locale,symbol),
  role: (value: unknown) => { const key=Object.keys(ar.roles).find(k => !["new","permissions","name"].includes(k) && ar.roles[k as keyof typeof ar.roles]===value); return key ? m.roles[key as keyof typeof ar.roles] : String(value ?? ""); },
  message: (value: string) => {const entry=Object.entries(ar.errors).find(([,v])=>v===value);return entry ? m.errors[entry[0] as keyof typeof ar.errors] : value===ar.interface.projectDates ? m.interface.projectDates : value;},
 };
}
export function browserLanguage(){ return language(typeof document !== "undefined" && document.documentElement.lang==="en"?"en":"ar"); }
