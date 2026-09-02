import { z } from "zod";

const optionalUrl = z
  .union([z.string().url().max(500), z.literal(""), z.null()])
  .optional();

const optionalText = (max: number) =>
  z.union([z.string().max(max), z.null()]).optional();

export const patchStoreSchema = z
  .object({
    storeId: z.number().int().positive(),
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().max(2000).optional(),
    logoUrl: optionalUrl,
    bannerUrl: optionalUrl,
    phone: optionalText(32),
    whatsapp: optionalText(32),
    email: z
      .union([z.string().email().max(255), z.literal(""), z.null()])
      .optional(),
    address: optionalText(500),
    instagramUrl: optionalUrl,
    facebookUrl: optionalUrl,
    twitterUrl: optionalUrl,
    tiktokUrl: optionalUrl,
  })
  .strict();

export type PatchStoreInput = z.infer<typeof patchStoreSchema>;
