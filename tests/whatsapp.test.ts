import { describe, expect, it } from "vitest";
import { normalizeWhatsAppRecipient, sendWhatsAppText } from "@/lib/server/whatsapp";

describe("whatsapp normalize", () => {
  it("normalizes Nigerian local numbers", () => {
    expect(normalizeWhatsAppRecipient("08031234567")).toBe("2348031234567");
    expect(normalizeWhatsAppRecipient("+234 803 123 4567")).toBe("2348031234567");
    expect(normalizeWhatsAppRecipient("2348031234567")).toBe("2348031234567");
  });

  it("parses wa.me links", () => {
    expect(normalizeWhatsAppRecipient("https://wa.me/2348031234567")).toBe("2348031234567");
  });

  it("rejects garbage", () => {
    expect(normalizeWhatsAppRecipient("not-a-phone")).toBeNull();
    expect(normalizeWhatsAppRecipient("")).toBeNull();
  });
});

describe("whatsapp mock send", () => {
  it("mock mode succeeds", async () => {
    process.env.WHATSAPP_MODE = "mock";
    const r = await sendWhatsAppText({ to: "08031234567", body: "New order" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mode).toBe("mock");
  });
});
