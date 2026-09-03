import { z } from "zod";

export const PRODUCT_NAME_MAX = 160;
export const PRODUCT_DESCRIPTION_MAX = 4000;
export const PRODUCT_CATEGORY_MAX = 80;

export const SUGGESTED_CATEGORIES = [
  "General",
  "Fashion",
  "Electronics",
  "Beauty",
  "Food",
  "Home",
  "Accessories",
  "Other",
] as const;

export const createProductSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().trim().min(1).max(PRODUCT_NAME_MAX),
  description: z.string().max(PRODUCT_DESCRIPTION_MAX).optional(),
  priceNgn: z.number().positive().finite(),
  stock: z.number().int().min(0),
  category: z.string().trim().min(1).max(PRODUCT_CATEGORY_MAX).optional(),
  imageUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
});

export const patchProductSchema = z
  .object({
    productId: z.number().int().positive(),
    name: z.string().trim().min(1).max(PRODUCT_NAME_MAX).optional(),
    description: z.string().max(PRODUCT_DESCRIPTION_MAX).optional(),
    priceNgn: z.number().positive().finite().optional(),
    stock: z.number().int().min(0).optional(),
    category: z.string().trim().min(1).max(PRODUCT_CATEGORY_MAX).optional(),
    imageUrl: z.union([z.string().url(), z.literal(""), z.null()]).optional(),
    active: z.boolean().optional(),
    featured: z.boolean().optional(),
  })
  .strict();
