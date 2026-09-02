import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import {
  createStore,
  listStoresForOwner,
  updateStore,
  getStoreOwned,
} from "@/lib/server/repo";
import { patchStoreSchema } from "@/lib/stores/schema";
import { tryDeleteManagedBlob } from "@/lib/server/blob";
import { removeStoreBrandingImage } from "@/lib/server/storeBranding";

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().min(2).max(80).optional(),
  description: z.string().max(2000).optional(),
  phone: z.string().max(32).optional(),
  whatsapp: z.string().max(32).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional(),
});

function emptyToNull(v: string | null | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return v;
}

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stores = await listStoresForOwner(session.userId);
  return NextResponse.json({ stores });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid store data" },
        { status: 400 }
      );
    }
    const store = await createStore({
      ownerId: session.userId,
      ...parsed.data,
      email: parsed.data.email || undefined,
    });
    return NextResponse.json({ store });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = patchStoreSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid store data" },
        { status: 400 }
      );
    }

    const data = parsed.data;
    await getStoreOwned(data.storeId, session.userId);

    if (data.logoUrl === null || data.logoUrl === "") {
      await removeStoreBrandingImage({
        userId: session.userId,
        storeId: data.storeId,
        kind: "logo",
      });
      data.logoUrl = undefined;
    }
    if (data.bannerUrl === null || data.bannerUrl === "") {
      await removeStoreBrandingImage({
        userId: session.userId,
        storeId: data.storeId,
        kind: "banner",
      });
      data.bannerUrl = undefined;
    }

    const existing = await getStoreOwned(data.storeId, session.userId);
    const patch: Parameters<typeof updateStore>[2] = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.phone !== undefined) patch.phone = emptyToNull(data.phone);
    if (data.whatsapp !== undefined) patch.whatsapp = emptyToNull(data.whatsapp);
    if (data.email !== undefined) patch.email = emptyToNull(data.email);
    if (data.address !== undefined) patch.address = emptyToNull(data.address);
    if (data.logoUrl !== undefined) patch.logoUrl = emptyToNull(data.logoUrl);
    if (data.bannerUrl !== undefined) patch.bannerUrl = emptyToNull(data.bannerUrl);
    if (data.instagramUrl !== undefined)
      patch.instagramUrl = emptyToNull(data.instagramUrl);
    if (data.facebookUrl !== undefined)
      patch.facebookUrl = emptyToNull(data.facebookUrl);
    if (data.twitterUrl !== undefined)
      patch.twitterUrl = emptyToNull(data.twitterUrl);
    if (data.tiktokUrl !== undefined)
      patch.tiktokUrl = emptyToNull(data.tiktokUrl);

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ store: existing });
    }

    const store = await updateStore(session.userId, data.storeId, patch);

    for (const key of ["logoUrl", "bannerUrl"] as const) {
      if (data[key] === undefined) continue;
      const prev = existing[key];
      const next = store[key];
      if (prev && prev !== next) {
        await tryDeleteManagedBlob(prev, session.userId);
      }
    }

    return NextResponse.json({ store });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status =
      msg.includes("Forbidden") || msg.includes("not found") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
