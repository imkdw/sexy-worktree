import { z } from "zod";

export const repoConfigSchema = z.object({
  version: z.literal(1),
  worktree: z.object({
    baseDir: z.string().min(1),
    defaultBaseBranch: z.string().min(1),
    filesToCopy: z.array(z.string()).default([]),
    installCommand: z.string().min(1),
    initCommands: z.array(z.string()).default([]),
    defaultStartupCommand: z.string().default(""),
  }),
  jira: z
    .discriminatedUnion("enabled", [
      z.object({
        enabled: z.literal(true),
        workspaceUrl: z.url(),
        email: z.email(),
        tokenKeychainKey: z.string().min(1),
      }),
      z.object({
        enabled: z.literal(false),
        workspaceUrl: z.string(),
        email: z.string(),
        tokenKeychainKey: z.string(),
      }),
    ])
    .optional(),
  branchValidation: z.object({ requireJiraPattern: z.boolean() }).optional(),
});

export const enabledJiraConfigSchema = z.object({
  enabled: z.literal(true),
  workspaceUrl: z.url(),
  email: z.email(),
  tokenKeychainKey: z.string().min(1),
});

export type RepoConfig = z.infer<typeof repoConfigSchema>;
