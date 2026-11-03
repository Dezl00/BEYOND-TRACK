export function number(value: number | string, digits = 0, scale = 3) {
  return new Intl.NumberFormat(digits ? "ar-SA-u-nu-arab" : "ar-SA-u-nu-latn", {
    maximumFractionDigits: scale,
  }).format(Number(value));
}
export function date(value: Date | string, digits = 0, withTime = false) {
  return new Intl.DateTimeFormat(
    digits ? "ar-SA-u-ca-gregory-nu-arab" : "ar-SA-u-ca-gregory-nu-latn",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...(withTime ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
      timeZone: "Asia/Riyadh",
    },
  ).format(new Date(value));
}
export function requestCode(value: number | string) {
  return `PR-${String(value).padStart(5, "0")}`;
}
