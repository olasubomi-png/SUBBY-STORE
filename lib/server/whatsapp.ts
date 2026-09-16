/**
 * Optional WhatsApp alerts to the seller's store WhatsApp number.
 *
 * Meta WhatsApp Cloud API (or compatible). Disabled unless configured.
 * Never throws to callers — failures are logged only.
 *
 * Env:
 *   WHATSAPP_ENABLED=1
 *   WHATSAPP_TOKEN=...
 *   WHATSAPP_PHONE_NUMBER_ID=...
 *   WHATSAPP_API_VERSION=v21.0 (optional)
 *   WHATSAPP_TEMPLATE_NAME=seller_alert (optional — preferred in production)
 *   WHATSAPP_TEMPLATE_LANG=en (optional)
 *
 * Store must have `whatsapp` set in Settings (digits, e.g. 0801… or 234801…).
 */

export type WhatsAppSendResult =
  | { ok: true; mode: "mock" | "live"; to: string }
  | { ok: false; reason: string };

/** Normalize NG / international numbers to digits-only E.164 without +. */
export function normalizeWhatsAppRecipient(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  // Strip wa.me links / url junk
  const waMe = s.match(/(?:wa\.me\/|whatsapp\.com\/send\?phone=)(\+?\d+)/i);
  if (waMe?.[1]) s = waMe[1];
  s = s.replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  // Nigerian local 0XXXXXXXXXX → 234XXXXXXXXXX
  if (/^0\d{10}$/.test(s)) s = `234${s.slice(1)}`;
  // Already 234…
  if (!/^\d{10,15}$/.test(s)) return null;
  return s;
}

function isEnabled(): boolean {
  if (process.env.WHATSAPP_ENABLED === "0") return false;
  if (process.env.WHATSAPP_MODE === "mock" || process.env.PAYSTACK_MOCK === "1" || process.env.VITEST === "true") {
    return process.env.WHATSAPP_ENABLED === "1"; // explicit mock send logging only when forced
  }
  return (
    process.env.WHATSAPP_ENABLED === "1" ||
    Boolean(process.env.WHATSAPP_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim())
  );
}

function isMock(): boolean {
  return (
    process.env.WHATSAPP_MODE === "mock" ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true" ||
    !process.env.WHATSAPP_TOKEN?.trim()
  );
}

/**
 * Send a plain-text (or template) WhatsApp message to a recipient.
 */
export async function sendWhatsAppText(input: {
  to: string;
  body: string;
  /** Optional template variables when WHATSAPP_TEMPLATE_NAME is set */
  templateParams?: string[];
}): Promise<WhatsAppSendResult> {
  const to = normalizeWhatsAppRecipient(input.to);
  if (!to) return { ok: false, reason: "invalid_recipient" };
  if (!isEnabled() && !isMock()) return { ok: false, reason: "whatsapp_disabled" };

  const body = input.body.slice(0, 900);

  if (isMock()) {
    if (process.env.WHATSAPP_DEBUG === "1") {
      console.info("[whatsapp:mock]", { to, body: body.slice(0, 120) });
    }
    return { ok: true, mode: "mock", to };
  }

  const token = process.env.WHATSAPP_TOKEN!.trim();
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID!.trim();
  const version = process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
  const url = `https://graph.facebook.com/${version}/${phoneId}/messages`;

  const templateName = process.env.WHATSAPP_TEMPLATE_NAME?.trim();
  let payload: Record<string, unknown>;

  if (templateName) {
    const params = (input.templateParams?.length ? input.templateParams : [body]).map(
      (text) => ({ type: "text", text: String(text).slice(0, 500) })
    );
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANG?.trim() || "en" },
        components: [
          {
            type: "body",
            parameters: params.slice(0, 5),
          },
        ],
      },
    };
  } else {
    // Session / utility text — works when policy allows; prefer templates in production.
    payload = {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { preview_url: false, body },
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[whatsapp] send failed", res.status, errText.slice(0, 300));
      return { ok: false, reason: `http_${res.status}` };
    }
    return { ok: true, mode: "live", to };
  } catch (e) {
    console.error("[whatsapp] network error", e instanceof Error ? e.message : e);
    return { ok: false, reason: "network_error" };
  }
}

/**
 * Notify the store owner on WhatsApp using the store.whatsapp field.
 */
export async function notifyStoreWhatsApp(input: {
  storeId: number;
  title: string;
  message: string;
}): Promise<WhatsAppSendResult> {
  if (process.env.WHATSAPP_ENABLED === "0") {
    return { ok: false, reason: "whatsapp_disabled" };
  }

  let phone: string | null = null;
  try {
    const { useMemory } = await import("@/lib/server/repo");
    if (useMemory()) {
      const mem = await import("@/lib/server/memory-repo");
      const s = mem.getMemoryStore().stores.find((x) => x.id === input.storeId);
      phone = s?.whatsapp ?? null;
    } else {
      const { getDb } = await import("@/db/client");
      const { stores } = await import("@/db/schema");
      const { eq } = await import("drizzle-orm");
      const rows = await getDb()
        .select({ whatsapp: stores.whatsapp })
        .from(stores)
        .where(eq(stores.id, input.storeId))
        .limit(1);
      phone = rows[0]?.whatsapp ?? null;
    }
  } catch {
    return { ok: false, reason: "store_lookup_failed" };
  }

  if (!phone) return { ok: false, reason: "no_whatsapp_on_store" };

  const text = `SUBBY STORE\n${input.title}\n${input.message}`;
  return sendWhatsAppText({
    to: phone,
    body: text,
    templateParams: [input.title, input.message],
  });
}
