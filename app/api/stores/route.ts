import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import {
  createStore,
  listStoresForOwner,
  updateStore,
} from "@/lib/server/repo";

const createSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().min(2).max(80).optional(),
  description: z.string().max(2000).optional(),
  phone: z.string().max(32).optional(),
  whatsapp: z.string().max(32).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional(),
});

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
      return NextResponse.json({ error: "Invalid store data" }, { status: 400 });
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
    const storeId = Number(body.storeId);
    if (!Number.isSafeInteger(storeId)) {
      return NextResponse.json({ error: "Invalid store" }, { status: 400 });
    }
    const store = await updateStore(session.userId, storeId, body);
    return NextResponse.json({ store });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status = msg.includes("Forbidden") || msg.includes("not found") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
