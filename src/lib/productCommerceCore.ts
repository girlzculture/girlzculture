export function productOrderReferenceFromNumber(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Product order reference values must be positive integers.");
  }
  let block = Math.floor((value - 1) / 99) + 1;
  const suffix = ((value - 1) % 99) + 1;
  let letters = "";
  while (block > 0) {
    block -= 1;
    letters = String.fromCharCode(65 + (block % 26)) + letters;
    block = Math.floor(block / 26);
  }
  return `GC-P-${letters}-${String(suffix).padStart(2, "0")}`;
}

export function productRefundSummary(
  totalAmount: number,
  successfulRefundAmount: number,
  processingFee: number,
) {
  const total = Math.max(0, Number(totalAmount || 0));
  const refunded = Math.min(
    total,
    Math.max(0, Number(successfulRefundAmount || 0)),
  );
  const fee = Math.max(0, Number(processingFee || 0));
  const fullyRefunded = refunded + 0.0001 >= total;
  return {
    paymentStatus: fullyRefunded
      ? ("Refunded" as const)
      : refunded > 0
        ? ("Partially Refunded" as const)
        : ("Paid" as const),
    netAmountOwedSalon: Math.max(0, total - fee - refunded),
    payoutStatus: fullyRefunded
      ? ("Destination payment reversed" as const)
      : refunded > 0
        ? ("Destination payment partially reversed" as const)
        : null,
  };
}
