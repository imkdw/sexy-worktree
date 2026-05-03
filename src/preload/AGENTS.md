# PRELOAD KNOWLEDGE

## OVERVIEW

Preload is the narrow typed bridge from Electron IPC to renderer `window.api`. Keep it boring and synchronized with shared IPC contracts.

## WHERE TO LOOK

| Task                 | Location                  | Notes                                      |
| -------------------- | ------------------------- | ------------------------------------------ |
| IPC contracts        | `src/shared/ipc.ts`       | Channel input/output types live there      |
| Main handlers        | `src/main/ipc/`           | Runtime implementation of invoked channels |
| Renderer type mirror | `src/renderer/ipc/api.ts` | Must match exposed API shape               |

## CONVENTIONS

- Use `contextBridge.exposeInMainWorld("api", api)` only.
- Request/response calls use `makeInvoker("channel")` typed by `IpcChannels`.
- Event listeners return unsubscribe functions and remove the exact listener they add.
- Keep this layer free of business logic; validation and domain work belong in main/shared/renderer.

## UPDATE TOGETHER

- Add channel: `src/shared/ipc.ts`, main handler, main registry, this preload API, renderer API type, call sites, tests.
- Add event: shared payload type, main `webContents.send`, preload `ipcRenderer.on/off`, renderer API type, consumer cleanup.

## ANTI-PATTERNS

- Do not expose raw `ipcRenderer` to the renderer.
- Do not expose Node, filesystem, git, PTY, or Electron objects directly.
- Do not let preload API shape drift from `src/renderer/ipc/api.ts`.
