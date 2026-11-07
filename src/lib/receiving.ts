import Decimal from "decimal.js";
export type ReceiptQuantities = {
  accepted: string;
  damaged: string;
  rejected: string;
  returned: string;
};
export function remainingQuantity(
  quantity: string,
  accepted: string,
  returned: string,
) {
  return Decimal.max(
    0,
    new Decimal(quantity).minus(accepted).plus(returned),
  ).toString();
}
export function receiptQuantityError(
  quantity: string,
  previousAccepted: string,
  previousReturned: string,
  next: ReceiptQuantities,
) {
  const net = new Decimal(previousAccepted).minus(previousReturned);
  if (new Decimal(next.returned).gt(net)) return "returned" as const;
  const capacity = Decimal.max(
    0,
    new Decimal(quantity).minus(net).plus(next.returned),
  );
  if (
    new Decimal(next.accepted)
      .plus(next.damaged)
      .plus(next.rejected)
      .gt(capacity)
  )
    return "receiptLimit" as const;
  return null;
}
export function changeReceiptQuantity(
  current: ReceiptQuantities,
  field: keyof ReceiptQuantities,
  value: string,
): ReceiptQuantities {
  const next = { ...current, [field]: value };
  if (
    (field === "damaged" || field === "rejected") &&
    /^\d*(\.\d*)?$/.test(value)
  ) {
    const total = new Decimal(current.accepted || 0)
      .plus(current.damaged || 0)
      .plus(current.rejected || 0);
    next.accepted = Decimal.max(
      0,
      total.minus(next.damaged || 0).minus(next.rejected || 0),
    ).toString();
  }
  return next;
}
