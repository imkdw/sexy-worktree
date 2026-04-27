import { useEffect, useState } from "react";
import { FolderOpen } from "lucide-react";
import { Icon } from "../icons/Icon";
import { api } from "../ipc/api";
import { useRepos } from "../state/repos";

export function NoRepo(): React.JSX.Element {
  const { openRepo } = useRepos();
  const [recents, setRecents] = useState<{ path: string; name: string }[]>([]);
  useEffect(() => {
    void (async () => {
      const r = await api.recents.list();
      if (r.ok) setRecents(r.value.recents);
    })();
  }, []);
  return (
    <div className="mx-auto flex max-w-[360px] flex-col items-center gap-4 pt-[15vh]">
      <Icon icon={FolderOpen} size={24} />
      <div className="text-xl font-semibold">No repository open</div>
      <div className="text-text-secondary text-center text-base">
        Open a git repository to start managing its worktrees in one place.
      </div>
      <button
        onClick={() => void openRepo()}
        className="text-background bg-accent rounded-sm px-3 py-2 text-sm font-medium"
      >
        Open Repository… ⌘O
      </button>
      {recents.length > 0 && (
        <div className="mt-4 w-full">
          <div className="text-text-muted mb-2 text-xs">Recent</div>
          {recents.map((r) => (
            <div key={r.path} className="text-text-secondary p-2">
              {r.path}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
