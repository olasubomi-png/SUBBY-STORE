import { z } from "zod";

export const couponTypeSchema = z.enum(["percentage", "fixed"]);

export const createCouponSchema = z
  .object({
    storeId: z.number().int().positive(),
    code: z.string().min(2).max(40),
    type: couponTypeSchema,
    value: z.number().int().positive(),
    minimumOrderAmountNgn: z.number().min(0).optional().default(0),
    maximumDiscountAmountNgn: z.number().min(0).nullable().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    usageLimit: z.number().int().positive().nullable().optional(),
    perCustomerLimit: z.number().int().positive().nullable().optional(),
    active: z.boolean().optional().default(true),
    productIds: z.array(z.number().int().positive()).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.type === "percentage" && (data.value < 1 || data.value > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Percentage must be between 1 and 100",
        path: ["value"],
      });
    }
  });

export const patchCouponSchema = z.object({
  couponId: z.number().int().positive(),
  code: z.string().min(2).max(40).optional(),
  type: couponTypeSchema.optional(),
  value: z.number().int().positive().optional(),
  minimumOrderAmountNgn: z.number().min(0).optional(),
  maximumDiscountAmountNgn: z.number().min(0).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perCustomerLimit: z.number().int().positive().nullable().optional(),
  active: z.boolean().optional(),
  productIds: z.array(z.number().int().positive()).max(200).optional(),
});

export const validateCouponSchema = z.object({
  storeSlug: z.string().min(1),
  code: z.string().min(1).max(40),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  customerEmail: z.string().email().optional(),
});
