/**
 * Store logo/banner lifecycle: upload → DB update → cleanup previous blob.
 * If DB update fails after upload, the new blob is deleted to avoid orphans.
 */
import {
  assertAllowedImageFile,
  imageExtension,
  putManagedBlob,
  tryDeleteManagedBlob,
} from "@/lib/server/blob";
import * as repo from "@/lib/server/repo";

export type BrandingKind = "logo" | "banner";

export async function replaceStoreBrandingImage(input: {
  userId: number;
  storeId: number;
  kind: BrandingKind;
  file: File;
}): Promise<{ url: string; store: Awaited<ReturnType<typeof repo.updateStore>> }> {
  const { userId, storeId, kind, file } = input;
  if (kind !== "logo" && kind !== "banner") {
    throw new Error("kind must be logo or banner");
  }
  assertAllowedImageFile(file);

  const existing = await repo.getStoreOwned(storeId, userId);
  const field = kind === "logo" ? "logoUrl" : "bannerUrl";
  const previousUrl = existing[field] as string | null;

  const pathname = `stores/${userId}/${kind}/${crypto.randomUUID()}.${imageExtension(file.type)}`;
  const newUrl = await putManagedBlob(pathname, file);

  try {
    const store = await repo.updateStore(userId, storeId, {
      [field]: newUrl,
    });
    if (previousUrl && previousUrl !== newUrl) {
      await tryDeleteManagedBlob(previousUrl, userId);
    }
    return { url: newUrl, store };
  } catch (err) {
    await tryDeleteManagedBlob(newUrl, userId);
    throw err;
  }
}

export async function removeStoreBrandingImage(input: {
  userId: number;
  storeId: number;
  kind: BrandingKind;
}): Promise<{ store: Awaited<ReturnType<typeof repo.updateStore>> }> {
  const { userId, storeId, kind } = input;
  const existing = await repo.getStoreOwned(storeId, userId);
  const field = kind === "logo" ? "logoUrl" : "bannerUrl";
  const previousUrl = existing[field] as string | null;

  const store = await repo.updateStore(userId, storeId, { [field]: null });
  if (previousUrl) {
    await tryDeleteManagedBlob(previousUrl, userId);
  }
  return { store };
}
