export function getVisitorId(): string {
  if (typeof window === "undefined") return "";
  const key = "subby_visitor_id";
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `v_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "";
  }
}

export async function trackStoreEvent(input: {
  storeSlug: string;
  eventType: string;
  productId?: number;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeSlug: input.storeSlug,
        eventType: input.eventType,
        productId: input.productId,
        visitorId: getVisitorId(),
        metadata: input.metadata,
      }),
      keepalive: true,
    });
  } catch {
    /* non-blocking */
  }
}
