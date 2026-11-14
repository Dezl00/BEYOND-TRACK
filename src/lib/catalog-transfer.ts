import { language } from "@/messages/catalog";
import type { Locale } from "@/messages/types";
export function catalogHeaders(locale: Locale) {
  const { m } = language(locale);
  return [
    ...m.boq.headers,
    m.fields.quantity,
    m.fields.code,
    m.common.project,
    m.fields.description,
  ];
}
export const transferText = {
  ar: {
    new: "جديد",
    existing: "مطابق موجود — لن يُضاف مرة أخرى",
    duplicate: "مكرر في الملف — لن يُضاف مرة أخرى",
    error: "خطأ",
    invalid: "بيانات ناقصة أو غير صحيحة، أو كمية غير صالحة",
    conflict: "تعارض في الوحدة أو الكمية أو قسم غير مفعّل أو اسم ملتبس",
    project: "اسم المشروع لا يطابق المشروع المحدد",
    ready:
      "راجع جميع الصفوف قبل تأكيد الاستيراد. تُنشأ الأقسام والوحدات الجديدة تلقائياً، وتُتجاوز المطابقات والتكرارات.",
    blocked: "صحّح الصفوف التي تحتوي أخطاء وأعد اختيار الملف.",
    row: "الصف",
    result: "نتيجة المطابقة",
    preview: "معاينة الجدول",
    confirm: "تأكيد الاستيراد",
  },
  en: {
    new: "New",
    existing: "Existing match — skipped",
    duplicate: "Duplicate in file — skipped",
    error: "Error",
    invalid: "Missing or invalid data, or invalid quantity",
    conflict:
      "Conflicting unit or quantity, inactive section, or ambiguous name",
    project: "Project name does not match the selected project",
    ready:
      "Review all rows before confirming. New sections and units are created automatically; existing matches and duplicates are skipped.",
    blocked: "Correct the rows with errors and select the file again.",
    row: "Row",
    result: "Match result",
    preview: "Preview table",
    confirm: "Confirm import",
  },
};
export type ImportPreviewRow = {
  row: number;
  values: string[];
  status: "new" | "existing" | "duplicate" | "error";
  issue?: "invalid" | "conflict" | "project";
};
export const catalogName = (s: string) =>
  s.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
