import type { RepoConfigDto } from "@shared/ipc";

export type RepositorySettingsForm = {
  worktree: {
    baseDir: string;
    defaultBaseBranch: string;
    filesToCopyText: string;
    installCommand: string;
    initCommandsText: string;
    defaultStartupCommand: string;
  };
  jira: {
    enabled: boolean;
    workspaceUrl: string;
    email: string;
    tokenKeychainKey: string;
  };
};

export function arrayToLines(values: string[]): string {
  return values.join("\n");
}

export function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function formFromConfig(
  config: RepoConfigDto,
  defaultTokenKey: string
): RepositorySettingsForm {
  return {
    worktree: {
      baseDir: config.worktree.baseDir,
      defaultBaseBranch: config.worktree.defaultBaseBranch,
      filesToCopyText: arrayToLines(config.worktree.filesToCopy),
      installCommand: config.worktree.installCommand,
      initCommandsText: arrayToLines(config.worktree.initCommands),
      defaultStartupCommand: config.worktree.defaultStartupCommand,
    },
    jira: {
      enabled: config.jira?.enabled ?? false,
      workspaceUrl: config.jira?.workspaceUrl ?? "",
      email: config.jira?.email ?? "",
      tokenKeychainKey: config.jira?.tokenKeychainKey ?? defaultTokenKey,
    },
  };
}

export function normalizeRepositorySettingsForm(
  form: RepositorySettingsForm,
  previousConfig?: RepoConfigDto
): RepoConfigDto {
  const nextConfig: RepoConfigDto = {
    ...previousConfig,
    version: 1,
    worktree: {
      baseDir: form.worktree.baseDir.trim(),
      defaultBaseBranch: form.worktree.defaultBaseBranch.trim(),
      filesToCopy: linesToArray(form.worktree.filesToCopyText),
      installCommand: form.worktree.installCommand.trim(),
      initCommands: linesToArray(form.worktree.initCommandsText),
      defaultStartupCommand: form.worktree.defaultStartupCommand.trim(),
    },
  };

  const jira = {
    enabled: form.jira.enabled,
    workspaceUrl: form.jira.workspaceUrl.trim(),
    email: form.jira.email.trim(),
    tokenKeychainKey: form.jira.tokenKeychainKey.trim(),
  };

  const shouldPersistJira =
    jira.enabled ||
    jira.workspaceUrl.length > 0 ||
    jira.email.length > 0 ||
    previousConfig?.jira !== undefined;

  if (shouldPersistJira) {
    nextConfig.jira = jira;
  } else {
    delete nextConfig.jira;
  }

  return nextConfig;
}
