/** Client + server safe fulfillment transition rules. */
export const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["confirmed", "processing", "cancelled"],
  confirmed: ["processing", "shipped", "cancelled"],
  processing: ["shipped", "delivered", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
  expired: [],
  refund_required: [],
};
