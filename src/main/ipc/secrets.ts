import { ipcMain, safeStorage } from "electron";
import { ok, err } from "@shared/result";
import type { IpcIn, IpcOut } from "@shared/ipc";
import { defaultKeychain } from "../secrets/keychain";

const kc = defaultKeychain(safeStorage);

export function registerSecretsHandlers(): void {
  ipcMain.handle(
    "secrets:get",
    async (_e, args: IpcIn<"secrets:get">): Promise<IpcOut<"secrets:get">> => {
      try {
        return ok({ value: await kc.get(args.key) });
      } catch (e) {
        return err({ message: (e as Error).message });
      }
    }
  );
  ipcMain.handle(
    "secrets:set",
    async (_e, args: IpcIn<"secrets:set">): Promise<IpcOut<"secrets:set">> => {
      try {
        await kc.set(args.key, args.value);
        return ok(undefined);
      } catch (e) {
        return err({ message: (e as Error).message });
      }
    }
  );
  ipcMain.handle(
    "secrets:remove",
    async (_e, args: IpcIn<"secrets:remove">): Promise<IpcOut<"secrets:remove">> => {
      try {
        await kc.remove(args.key);
        return ok(undefined);
      } catch (e) {
        return err({ message: (e as Error).message });
      }
    }
  );
}

export { kc as keychain };
