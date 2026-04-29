import { useEffect, useState } from "react";
import { TabBar } from "./chrome/TabBar";
import { TitleBar } from "./chrome/TitleBar";
import { Toolbar } from "./chrome/Toolbar";
import { Rail } from "./chrome/Rail";
import { ReposProvider, useRepos } from "./state/repos";
import { WorktreesProvider, useWorktrees } from "./state/worktrees";
import { ModeProvider, useMode } from "./state/mode";
import { SelectModeProvider, useSelectMode } from "./state/selectMode";
import { Grid } from "./grid/Grid";
import { Focus } from "./focus/Focus";
import { KeyboardShortcuts } from "./shortcuts/KeyboardShortcuts";
import { NewWorktreeModal } from "./newWorktree/NewWorktreeModal";
import { NewWorktreeProvider } from "./state/newWorktree";
import { ToastProvider } from "./state/toast";
import { TerminalSessionsProvider } from "./state/terminalSessions";
import { ToastLayer } from "./toast/Toast";
import { NoRepo } from "./empty/NoRepo";
import { Settings } from "./settings/Settings";
import { TooltipProvider } from "./ui";

function Shell(): React.JSX.Element {
  const { mode, setMode } = useMode();
  const { repos, activeRepoId } = useRepos();
  const { worktrees } = useWorktrees();
  const sm = useSelectMode();
  const active = repos.find((r) => r.id === activeRepoId) ?? null;
  const [modalOpen, setModalOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const fn = (): void => setModalOpen(true);
    window.addEventListener("app:new-worktree", fn);
    return () => window.removeEventListener("app:new-worktree", fn);
  }, []);

  useEffect(() => {
    const fn = (): void => setSettingsOpen(true);
    window.addEventListener("app:open-settings", fn);
    return () => window.removeEventListener("app:open-settings", fn);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && sm.active) sm.exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sm]);

  return (
    <div className="flex h-full flex-col">
      <KeyboardShortcuts />
      <TitleBar />
      <TabBar />
      <Toolbar
        repoPath={active?.path ?? ""}
        worktreeCount={worktrees.length}
        mode={mode}
        onModeChange={setMode}
        onNewWorktree={() => setModalOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <Rail />
        <main className="bg-background scrollbar-hidden flex-1 overflow-auto">
          {!activeRepoId ? <NoRepo /> : mode === "overview" ? <Grid /> : <Focus />}
        </main>
      </div>
      <ToastLayer />
      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <NewWorktreeModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

export function App(): React.JSX.Element {
  return (
    <TooltipProvider delayDuration={300}>
      <ToastProvider>
        <ReposProvider>
          <WorktreesProvider>
            <TerminalSessionsProvider>
              <NewWorktreeProvider>
                <SelectModeProvider>
                  <ModeProvider>
                    <Shell />
                  </ModeProvider>
                </SelectModeProvider>
              </NewWorktreeProvider>
            </TerminalSessionsProvider>
          </WorktreesProvider>
        </ReposProvider>
      </ToastProvider>
    </TooltipProvider>
  );
}
