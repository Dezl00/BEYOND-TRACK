import { language } from "@/messages/catalog";
import type { Locale } from "@/messages/types";
export function catalogHeaders(locale: Locale) {
  const { m } = language(locale);
  return [...m.boq.headers, m.fields.quantity, m.fields.description];
}
export const transferText = {
  ar: {
    new: "جديد",
    existing: "مطابق موجود — لن يُضاف مرة أخرى",
    duplicate: "مكرر",
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
    dropPrompt: "اختر ملف أو اسحبه وأفلته هنا!",
    dropHere: "أفلت الملف لبدء المعاينة",
    dropHelp: "ملفات Excel وCSV حتى 4 ميجابايت",
    chooseFile: "اختيار ملف",
    removeFile: "إزالة الملف",
    selectProject: "اختر مشروعاً للاستيراد",
    continue: "متابعة المعاينة",
    edit: "تعديل الصف",
    save: "حفظ التعديل ومعاينة التطابق",
    delete: "حذف الصف من الاستيراد",
    actions: "إجراءات",
  },
  en: {
    new: "New",
    existing: "Existing match — skipped",
    duplicate: "Duplicate",
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
    dropPrompt: "Choose a file or drag and drop it here",
    dropHere: "Drop the file to preview it",
    dropHelp: "Excel and CSV files up to 4 MB",
    chooseFile: "Choose file",
    removeFile: "Remove file",
    selectProject: "Choose a project to import into",
    continue: "Continue to preview",
    edit: "Edit row",
    save: "Save edit and check matches",
    delete: "Remove row from import",
    actions: "Actions",
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
