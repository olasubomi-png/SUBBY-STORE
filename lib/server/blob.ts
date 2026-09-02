/**
 * Secure Vercel Blob helpers for product + store images.
 * Deletion is restricted to managed namespaces owned by the authenticated user.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

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

export function assertAllowedImageFile(file: File): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Only JPG, PNG, and WebP images are allowed");
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image must be 5MB or smaller");
  }
}

export function imageExtension(mime: string): "jpg" | "png" | "webp" {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** Injectable for tests. */
export type BlobPutFn = (
  pathname: string,
  body: File,
  opts: { access: "public"; addRandomSuffix: boolean; contentType: string }
) => Promise<{ url: string }>;

export type BlobDelFn = (url: string) => Promise<void>;

let putImpl: BlobPutFn | null = null;
let delImpl: BlobDelFn | null = null;

export function setBlobAdapters(adapters: {
  put?: BlobPutFn | null;
  del?: BlobDelFn | null;
}): void {
  if (adapters.put !== undefined) putImpl = adapters.put;
  if (adapters.del !== undefined) delImpl = adapters.del;
}

export async function putManagedBlob(
  pathname: string,
  file: File
): Promise<string> {
  if (putImpl) {
    const res = await putImpl(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type,
    });
    return res.url;
  }
  const { put } = await import("@vercel/blob");
  const blob = await put(pathname, file, {
    access: "public",
    addRandomSuffix: false,
    contentType: file.type,
  });
  return blob.url;
}

export async function deleteManagedBlob(
  url: string,
  userId: number
): Promise<void> {
  if (!blobBelongsToUser(url, userId)) {
    throw new Error("Refusing to delete unmanaged or foreign image");
  }
  if (delImpl) {
    await delImpl(url);
    return;
  }
  const { del } = await import("@vercel/blob");
  await del(url);
}

/** Best-effort delete; never throws for cleanup paths. */
export async function tryDeleteManagedBlob(
  url: string | null | undefined,
  userId: number
): Promise<boolean> {
  if (!url || !blobBelongsToUser(url, userId)) return false;
  try {
    await deleteManagedBlob(url, userId);
    return true;
  } catch {
    return false;
  }
}
