export async function shareOrCopy(input: {
  title: string;
  text?: string;
  url: string;
}): Promise<"shared" | "copied" | "failed"> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({
        title: input.title,
        text: input.text,
        url: input.url,
      });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "failed";
    }
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(input.url);
      return "copied";
    }
  } catch {
    /* fall through */
  }
  return "failed";
}
