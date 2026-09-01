import { NextResponse } from "next/server";
import { signupSchema, createSessionToken, setSessionCookie } from "@/lib/server/auth";
import { signupUser } from "@/lib/server/repo";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }
    const user = await signupUser(parsed.data);
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
    });
    await setSessionCookie(token);
    return NextResponse.json({ user });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Signup failed";
    const status = msg.includes("already") ? 409 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
