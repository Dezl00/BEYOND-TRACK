import type { MessageCatalog } from "@/messages/types";
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
export const attachmentLabels = (m:MessageCatalog): Record<AttachmentPurpose,string> => ({request:m.interface.requestFile,receipt:m.interface.receiptFile,quotation:m.interface.quotation,alternative:m.interface.otherQuotes,payment:m.interface.paymentReceipt});
