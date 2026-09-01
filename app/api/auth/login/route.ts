import { NextResponse } from "next/server";
import { loginSchema, createSessionToken, setSessionCookie } from "@/lib/server/auth";
import { loginUser } from "@/lib/server/repo";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    const user = await loginUser(parsed.data.email, parsed.data.password);
    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
    });
    await setSessionCookie(token);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 }
    );
  }
}
