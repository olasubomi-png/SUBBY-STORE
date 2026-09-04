import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { listStoresForOwner } from "@/lib/server/repo";
import { getProfessionalDashboard } from "@/lib/server/dashboard";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const [stats, stores] = await Promise.all([
      getProfessionalDashboard(session.userId),
      listStoresForOwner(session.userId),
    ]);

    return NextResponse.json({ stats, stores });
  } catch (error) {
    console.error("[Dashboard] Failed to load dashboard", error);

    return NextResponse.json(
      { error: "Could not load dashboard" },
      { status: 500 },
    );
  }
}
