import { FolderOpen, Plus, X } from "lucide-react";
import { Icon } from "../icons/Icon";
import { cn } from "../lib/cn";
import { useRepos } from "../state/repos";

export function TabBar(): React.JSX.Element {
  const { repos, activeRepoId, openRepo, selectRepo, closeRepo } = useRepos();
  return (
    <div className="border-border-subtle bg-background flex h-[var(--tabbar-h)] items-stretch border-b [-webkit-app-region:no-drag]">
      {repos.map((repo) => {
        const active = repo.id === activeRepoId;
        return (
          <div
            key={repo.id}
            className={cn(
              "group border-border-subtle text-text-secondary hover:bg-surface relative inline-flex cursor-pointer items-center gap-2 border-r px-3 text-sm transition-colors duration-150",
              active &&
                "text-text-primary after:bg-accent font-medium after:absolute after:inset-x-0 after:bottom-0 after:h-0.5"
            )}
            onClick={() => void selectRepo(repo.id)}
          >
            <Icon icon={FolderOpen} size={14} />
            <span>{repo.name}</span>
            <span
              className="text-text-muted hover:text-text-primary inline-flex items-center opacity-0 transition-opacity duration-150 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                void closeRepo(repo.id);
              }}
            >
              <Icon icon={X} size={12} />
            </span>
          </div>
        );
      })}
      <div
        className="text-text-muted hover:bg-surface hover:text-text-primary inline-flex cursor-pointer items-center gap-2 px-3 text-sm transition-colors duration-150"
        onClick={() => void openRepo()}
      >
        <Icon icon={Plus} size={14} />
        <span>Open Repository</span>
      </div>
    </div>
  );
}
