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
    .object({
      enabled: z.boolean(),
      workspaceUrl: z.url(),
      email: z.email(),
      tokenKeychainKey: z.string().min(1),
    })
    .optional(),
  branchValidation: z.object({ requireJiraPattern: z.boolean() }).optional(),
});

export type RepoConfig = z.infer<typeof repoConfigSchema>;
