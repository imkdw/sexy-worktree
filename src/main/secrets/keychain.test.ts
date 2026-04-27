import { describe, it, expect } from "vitest";
import { makeKeychain } from "./keychain";

const memSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(`enc:${s}`, "utf8"),
  decryptString: (b: Buffer) => b.toString("utf8").replace(/^enc:/, ""),
};

describe("keychain", () => {
  it("encrypts and decrypts a stored secret round-trip", async () => {
    const store = new Map<string, Buffer>();
    const kc = makeKeychain({
      safeStorage: memSafeStorage as any,
      load: (k) => store.get(k) ?? null,
      save: (k, b) => {
        store.set(k, b);
      },
      remove: (k) => {
        store.delete(k);
      },
    });
    await kc.set("jira.repo1", "super-secret-token");
    const v = await kc.get("jira.repo1");
    expect(v).toBe("super-secret-token");
  });

  it("returns null for missing key", async () => {
    const kc = makeKeychain({
      safeStorage: memSafeStorage as any,
      load: () => null,
      save: () => {},
      remove: () => {},
    });
    expect(await kc.get("missing")).toBeNull();
  });
});
