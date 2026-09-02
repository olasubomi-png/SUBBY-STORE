/** Secure helpers for Vercel Blob (product + store images). */

function isVercelBlobHost(hostname: string): boolean {
  return (
    hostname.endsWith(".public.blob.vercel-storage.com") ||
    hostname.endsWith(".blob.vercel-storage.com")
  );
}

export function isManagedBlobUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (!isVercelBlobHost(u.hostname)) return false;
    return (
      u.pathname.includes("/products/") || u.pathname.includes("/stores/")
    );
  } catch {
    return false;
  }
}

export function blobBelongsToUser(url: string, userId: number): boolean {
  if (!isManagedBlobUrl(url)) return false;
  try {
    const u = new URL(url);
    return (
      u.pathname.includes(`/products/${userId}/`) ||
      u.pathname.includes(`/stores/${userId}/`)
    );
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
