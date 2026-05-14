import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_OVERVIEW_GRID_DENSITY,
  nextOverviewGridDensity,
  type OverviewGridDensity,
} from "@shared/overviewGridDensity";
import { api } from "../ipc/api";
import { useRepos } from "./repos";
import { useToast } from "./toast";

type State = {
  density: OverviewGridDensity;
  setDensity: (density: OverviewGridDensity) => Promise<void>;
  toggleDensity: () => Promise<void>;
};

const Ctx = createContext<State | null>(null);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

export function OverviewGridDensityProvider({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const { activeRepoId } = useRepos();
  const toast = useToast();
  const [densityByRepo, setDensityByRepo] = useState<Map<number, OverviewGridDensity>>(new Map());
  const densityByRepoRef = useRef<Map<number, OverviewGridDensity>>(new Map());
  const confirmedDensityByRepoRef = useRef<Map<number, OverviewGridDensity>>(new Map());
  const repoRevisionRef = useRef<Map<number, number>>(new Map());
  const saveChainByRepoRef = useRef<Map<number, Promise<void>>>(new Map());
  const activeRepoIdRef = useRef(activeRepoId);
  activeRepoIdRef.current = activeRepoId;

  const getRevision = useCallback((repoId: number): number => {
    return repoRevisionRef.current.get(repoId) ?? 0;
  }, []);

  const bumpRevision = useCallback(
    (repoId: number): number => {
      const next = getRevision(repoId) + 1;
      repoRevisionRef.current.set(repoId, next);
      return next;
    },
    [getRevision]
  );

  const setRepoDensity = useCallback((repoId: number, next: OverviewGridDensity): void => {
    const copy = new Map(densityByRepoRef.current);
    copy.set(repoId, next);
    densityByRepoRef.current = copy;
    setDensityByRepo(copy);
  }, []);

  const setConfirmedRepoDensity = useCallback(
    (repoId: number, next: OverviewGridDensity): void => {
      const copy = new Map(confirmedDensityByRepoRef.current);
      copy.set(repoId, next);
      confirmedDensityByRepoRef.current = copy;
    },
    []
  );

  const getConfirmedRepoDensity = useCallback((repoId: number): OverviewGridDensity | null => {
    return confirmedDensityByRepoRef.current.get(repoId) ?? null;
  }, []);

  const loadRepoDensity = useCallback(
    async (repoId: number, loadRevision: number, isCancelled?: () => boolean): Promise<void> => {
      try {
        const result = await api.overviewGridDensity.get({ repoId });
        if (
          isCancelled?.() ||
          activeRepoIdRef.current !== repoId ||
          getRevision(repoId) !== loadRevision
        )
          return;
        const next = result.ok ? result.value.density : DEFAULT_OVERVIEW_GRID_DENSITY;
        if (result.ok) {
          setConfirmedRepoDensity(repoId, next);
        }
        setRepoDensity(repoId, next);
      } catch {
        if (
          isCancelled?.() ||
          activeRepoIdRef.current !== repoId ||
          getRevision(repoId) !== loadRevision
        )
          return;
        setRepoDensity(repoId, DEFAULT_OVERVIEW_GRID_DENSITY);
      }
    },
    [getRevision, setConfirmedRepoDensity, setRepoDensity]
  );

  const handleSaveFailure = useCallback(
    (repoId: number, saveRevision: number): void => {
      if (getRevision(repoId) !== saveRevision) return;

      const confirmed = getConfirmedRepoDensity(repoId);
      if (confirmed == null) {
        setRepoDensity(repoId, DEFAULT_OVERVIEW_GRID_DENSITY);
        void loadRepoDensity(repoId, saveRevision);
        return;
      }

      setRepoDensity(repoId, confirmed);
    },
    [getConfirmedRepoDensity, getRevision, loadRepoDensity, setRepoDensity]
  );

  const scheduleSave = useCallback(
    (repoId: number, next: OverviewGridDensity, saveRevision: number): Promise<void> => {
      const saveTask = async (): Promise<void> => {
        let message: string;
        try {
          const result = await api.overviewGridDensity.set({ repoId, density: next });
          if (result.ok) {
            setConfirmedRepoDensity(repoId, next);
            return;
          }
          message = result.error.message;
        } catch (error) {
          message = errorMessage(error);
        }

        handleSaveFailure(repoId, saveRevision);
        toast.push({
          kind: "error",
          title: "Failed to save overview layout",
          description: message,
          durationMs: 5000,
        });
      };

      const previousChain = saveChainByRepoRef.current.get(repoId) ?? Promise.resolve();
      const nextChain = previousChain.then(saveTask, saveTask);
      saveChainByRepoRef.current.set(repoId, nextChain);

      void nextChain.then(
        () => {
          if (saveChainByRepoRef.current.get(repoId) === nextChain) {
            saveChainByRepoRef.current.delete(repoId);
          }
        },
        () => {
          if (saveChainByRepoRef.current.get(repoId) === nextChain) {
            saveChainByRepoRef.current.delete(repoId);
          }
        }
      );

      return nextChain;
    },
    [handleSaveFailure, setConfirmedRepoDensity, toast]
  );

  useEffect(() => {
    if (activeRepoId == null) return;
    const repoId = activeRepoId;
    const loadRevision = getRevision(repoId);
    let cancelled = false;

    void loadRepoDensity(repoId, loadRevision, () => cancelled);

    return () => {
      cancelled = true;
    };
  }, [activeRepoId, getRevision, loadRepoDensity]);

  const density =
    activeRepoId == null
      ? DEFAULT_OVERVIEW_GRID_DENSITY
      : (densityByRepo.get(activeRepoId) ?? DEFAULT_OVERVIEW_GRID_DENSITY);

  const setDensity = useCallback(
    async (next: OverviewGridDensity): Promise<void> => {
      if (activeRepoId == null) return;
      const repoId = activeRepoId;
      const saveRevision = bumpRevision(repoId);

      setRepoDensity(repoId, next);
      await scheduleSave(repoId, next, saveRevision);
    },
    [activeRepoId, bumpRevision, scheduleSave, setRepoDensity]
  );

  const toggleDensity = useCallback(async (): Promise<void> => {
    await setDensity(nextOverviewGridDensity(density));
  }, [density, setDensity]);

  const value = useMemo<State>(
    () => ({ density, setDensity, toggleDensity }),
    [density, setDensity, toggleDensity]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOverviewGridDensity(): State {
  const value = useContext(Ctx);
  if (!value)
    throw new Error("useOverviewGridDensity must be inside <OverviewGridDensityProvider>");
  return value;
}
