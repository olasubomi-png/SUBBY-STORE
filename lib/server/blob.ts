/** Secure helpers for Vercel Blob product images. */

export function isManagedBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    const hostOk =
      u.hostname.endsWith(".public.blob.vercel-storage.com") ||
      u.hostname.endsWith(".blob.vercel-storage.com");
    const pathOk = u.pathname.includes("/products/");
    return hostOk && pathOk;
  } catch {
    return false;
  }
}

export function blobBelongsToUser(url: string, userId: number): boolean {
  if (!isManagedBlobUrl(url)) return false;
  try {
    const u = new URL(url);
    return u.pathname.includes(`/products/${userId}/`);
  } catch {
    return false;
  }
}

export async function deleteManagedBlob(
  url: string,
  userId: number
): Promise<void> {
  if (!blobBelongsToUser(url, userId)) {
    throw new Error("Refusing to delete unmanaged or foreign image");
  }
  const { del } = await import("@vercel/blob");
  await del(url);
}
