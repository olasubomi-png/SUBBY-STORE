/** Shared inventory classification (client + server safe). */
export const LOW_STOCK_THRESHOLD = 5 as const;

export function classifyStock(stock: number): "out" | "low" | "in" {
  if (stock <= 0) return "out";
  if (stock <= LOW_STOCK_THRESHOLD) return "low";
  return "in";
}
