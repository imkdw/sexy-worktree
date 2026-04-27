import type { safeStorage as SafeStorage } from "electron";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getUserDataDir } from "../paths";

export type Keychain = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

type Deps = {
  safeStorage: typeof SafeStorage;
  load: (key: string) => Buffer | null;
  save: (key: string, blob: Buffer) => void;
  remove: (key: string) => void;
};

export function makeKeychain(deps: Deps): Keychain {
  return {
    async get(key) {
      const blob = deps.load(key);
      if (!blob) return null;
      if (!deps.safeStorage.isEncryptionAvailable()) return null;
      try {
        return deps.safeStorage.decryptString(blob);
      } catch {
        return null;
      }
    },
    async set(key, value) {
      if (!deps.safeStorage.isEncryptionAvailable()) {
        throw new Error("safeStorage encryption is not available");
      }
      const blob = deps.safeStorage.encryptString(value);
      deps.save(key, blob);
    },
    async remove(key) {
      deps.remove(key);
    },
  };
}

function secretsDir(): string {
  const dir = join(getUserDataDir(), "secrets");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function fileFor(key: string): string {
  return join(secretsDir(), key.replace(/[^a-zA-Z0-9._-]/g, "_"));
}

export function defaultKeychain(safeStorage: typeof SafeStorage): Keychain {
  return makeKeychain({
    safeStorage,
    load: (key) => {
      const f = fileFor(key);
      return existsSync(f) ? readFileSync(f) : null;
    },
    save: (key, blob) => writeFileSync(fileFor(key), blob),
    remove: (key) => {
      const f = fileFor(key);
      if (existsSync(f)) unlinkSync(f);
    },
  });
}
