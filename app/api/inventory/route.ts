import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import {
  adjustProductStock,
  listInventoryForOwner,
} from "@/lib/server/repo";

const adjustSchema = z
  .object({
    productId: z.number().int().positive(),
    mode: z.enum(["set", "delta"]),
    value: z.number().int(),
  })
  .strict();

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const products = await listInventoryForOwner(session.userId);
    return NextResponse.json({ products });
  } catch (error) {
    console.error("[Inventory] list failed", error);
    return NextResponse.json(
      { error: "Could not load inventory" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = adjustSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid request" },
        { status: 400 }
      );
    }
    const product = await adjustProductStock(
      session.userId,
      parsed.data.productId,
      { mode: parsed.data.mode, value: parsed.data.value }
    );
    return NextResponse.json({ product });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    const status =
      msg === "Product not found" || msg === "Forbidden" ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
