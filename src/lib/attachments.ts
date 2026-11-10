export const attachmentPurposes = [
  "request",
  "receipt",
  "quotation",
  "alternative",
  "payment",
] as const;
export type AttachmentPurpose = (typeof attachmentPurposes)[number];
export type RequestAttachment = {
  id: string;
  name: string;
  purpose: AttachmentPurpose;
  pricing_revision: number | null;
  payment_id: string | null;
};
export const attachmentLabels: Record<AttachmentPurpose, string> = {
  request: "مرفق الطلب",
  receipt: "مرفق الاستلام",
  quotation: "عرض السعر",
  alternative: "عروض أسعار أخرى",
  payment: "إيصال الدفع",
};
