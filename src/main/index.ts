import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { registerIpc } from "./ipc";
import { closeDb, getDb } from "./db";
import { ptyManager } from "./ipc/pty";

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

/**
 * 메인 BrowserWindow를 생성하고 렌더러를 로드한다.
 *
 * 개발 모드에서는 dev 서버 URL을 로드하고 DevTools를 분리 모드로 연다.
 * 프로덕션에서는 빌드된 index.html을 로드한다.
 */
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#09090B",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    await mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  getDb(); // 어떤 IPC보다 먼저 마이그레이션이 실행되도록 보장
  registerIpc(() => mainWindow);
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("before-quit", () => {
  ptyManager.killAll();
});

app.on("window-all-closed", () => {
  closeDb();
  if (process.platform !== "darwin") app.quit();
});
