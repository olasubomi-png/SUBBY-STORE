import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import {
  bulkSetProductsActive,
  bulkDeleteProducts,
} from "@/lib/server/repo";

const bulkSchema = z.object({
  productIds: z.array(z.number().int().positive()).min(1).max(200),
  action: z.enum(["activate", "deactivate", "delete"]),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 }
    );
  }

  const { productIds, action } = parsed.data;
  try {
    if (action === "delete") {
      const result = await bulkDeleteProducts(session.userId, productIds);
      return NextResponse.json({ ok: true, ...result });
    }
    const active = action === "activate";
    const result = await bulkSetProductsActive(
      session.userId,
      productIds,
      active
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bulk operation failed";
    const status = /not found|unauthorized|forbidden/i.test(msg) ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
