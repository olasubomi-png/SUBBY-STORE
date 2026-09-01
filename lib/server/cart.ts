import { z } from "zod";
import { lineTotalKobo, sumKobo } from "@/lib/money";

export const cartItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive().max(100),
});

export const cartSchema = z.object({
  items: z.array(cartItemSchema).min(1).max(50),
});

export type CartItemInput = z.infer<typeof cartItemSchema>;

export type PricedCartLine = {
  productId: number;
  name: string;
  unitPriceKobo: number;
  quantity: number;
  lineTotalKobo: number;
  stock: number;
};

export type PricedCart = {
  lines: PricedCartLine[];
  subtotalKobo: number;
  totalKobo: number;
  currency: "NGN";
};

/** Server-authoritative cart pricing from product rows. */
export function priceCart(
  items: CartItemInput[],
  products: Array<{
    id: number;
    name: string;
    priceKobo: number;
    stock: number;
    active: boolean;
  }>
): PricedCart {
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines: PricedCartLine[] = [];

  for (const item of items) {
    const product = byId.get(item.productId);
    if (!product) throw new Error("Invalid product");
    if (!product.active) throw new Error("Product is not available");
    if (item.quantity > product.stock) {
      throw new Error(`Insufficient stock for ${product.name}`);
    }
    const line = lineTotalKobo(product.priceKobo, item.quantity);
    lines.push({
      productId: product.id,
      name: product.name,
      unitPriceKobo: product.priceKobo,
      quantity: item.quantity,
      lineTotalKobo: line,
      stock: product.stock,
    });
  }

  const subtotalKobo = sumKobo(lines.map((l) => l.lineTotalKobo));
  return {
    lines,
    subtotalKobo,
    totalKobo: subtotalKobo,
    currency: "NGN",
  };
}
