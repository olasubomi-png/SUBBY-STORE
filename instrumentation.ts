export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionConfig } = await import("@/lib/server/config");
    try {
      assertProductionConfig();
    } catch (e) {
      if (process.env.NODE_ENV === "production") {
        console.error("[SUBBY-STORE] Production configuration error:", e);
        throw e;
      }
    }
  }
}
