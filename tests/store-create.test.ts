import { afterEach, describe, expect, it } from "vitest";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
} from "@/lib/server/memory-repo";
import { createStore } from "@/lib/server/repo";

afterEach(() => {
  resetMemoryStore();
});

describe("multi-seller store creation", () => {
  it("allows different users to create stores", async () => {
    const a = await memSignup({
      email: "seller-a@example.com",
      password: "password12",
      fullName: "Ada",
    });
    const b = await memSignup({
      email: "seller-b@example.com",
      password: "password12",
      fullName: "Bola",
    });
    const storeA = await createStore({ ownerId: a.id, name: "Ada Fashion" });
    const storeB = await createStore({ ownerId: b.id, name: "Bola Fashion" });
    expect(storeA.ownerId).toBe(a.id);
    expect(storeB.ownerId).toBe(b.id);
    expect(storeA.slug).not.toBe(storeB.slug);
  });

  it("auto-suffixes name-based slug when taken by another seller", async () => {
    const a = await memSignup({
      email: "s1@example.com",
      password: "password12",
      fullName: "S1",
    });
    const b = await memSignup({
      email: "s2@example.com",
      password: "password12",
      fullName: "S2",
    });
    const first = await createStore({ ownerId: a.id, name: "Cool Shop" });
    expect(first.slug).toBe("cool-shop");
    const second = await createStore({ ownerId: b.id, name: "Cool Shop" });
    expect(second.slug).toMatch(/^cool-shop-/);
  });

  it("rejects explicit slug that is already taken", async () => {
    const a = await memSignup({
      email: "s3@example.com",
      password: "password12",
      fullName: "S3",
    });
    const b = await memSignup({
      email: "s4@example.com",
      password: "password12",
      fullName: "S4",
    });
    await createStore({ ownerId: a.id, name: "Mine", slug: "exclusive-slug" });
    await expect(
      createStore({ ownerId: b.id, name: "Yours", slug: "exclusive-slug" })
    ).rejects.toThrow(/already taken/i);
  });

  it("allows only one store per account", async () => {
    const user = await memSignup({
      email: "one@example.com",
      password: "password12",
      fullName: "One",
    });
    await createStore({ ownerId: user.id, name: "First Shop" });
    await expect(
      createStore({ ownerId: user.id, name: "Second Shop" })
    ).rejects.toThrow(/already have a store/i);
  });

  it("memCreateStore blocks second store for same owner", async () => {
    const user = await memSignup({
      email: "mem@example.com",
      password: "password12",
      fullName: "Mem",
    });
    memCreateStore({ ownerId: user.id, name: "Only" });
    expect(() =>
      memCreateStore({ ownerId: user.id, name: "Again" })
    ).toThrow(/already have a store/i);
  });
});
