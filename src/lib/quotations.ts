export type QuotePrice = { id: string; quantity: string; price: string };
export type Quote = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  expected_at: string;
  selected: boolean;
  prices: QuotePrice[];
  attachment_ids?: string[];
  approved_by: string | null;
};
