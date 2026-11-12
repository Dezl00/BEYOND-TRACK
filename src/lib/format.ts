/** Remove database padding without rounding an entered fraction. */
export function decimalText(value: unknown) {
  const raw = String(value ?? "");
  if (!/^\d+\.\d*$/.test(raw)) return raw;
  return raw.replace(/0+$/, "").replace(/\.$/, "");
}
export function number(value: number | string, digits = 0, scale = 3, locale = "ar") {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : digits ? "ar-SA-u-nu-arab" : "ar-SA-u-nu-latn", {
    maximumFractionDigits: scale,
  }).format(Number(value));
}
export function date(value: Date | string, digits = 0, withTime = false, locale = "ar") {
  return new Intl.DateTimeFormat(
    locale === "en" ? "en-GB" : digits ? "ar-SA-u-ca-gregory-nu-arab" : "ar-SA-u-ca-gregory-nu-latn",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(withTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
      timeZone: "Asia/Riyadh",
    },
  ).format(new Date(value));
}
export function requestCode(value: string) {
  return value;
}
