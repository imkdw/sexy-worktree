import { ok, err, type Result } from "@shared/result";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

/**
 * @anthropic-ai/claude-code는 JS 모듈이 아니라 컴파일된 바이너리 CLI다.
 *
 * `query`나 `SDKMessage` 같은 심볼을 export하지 않으며 네이티브 실행 파일로 배포된다.
 * 따라서 `-p`(--print) 플래그와 `--output-format json` 옵션으로 자식 프로세스를 띄워 호출한다.
 */

const require = createRequire(import.meta.url);
const CLAUDE_PACKAGE_BIN = "@anthropic-ai/claude-code/bin/claude.exe";
const PACKAGED_CLAUDE_BIN = join("claude-code", "bin", "claude.exe");

export function resolveClaudeBinaryPath(
  args: {
    existsSync?: (path: string) => boolean;
    isPackaged?: boolean;
    requireResolve?: (id: string) => string;
    resourcesPath?: string;
  } = {}
): string {
  const isPackaged = args.isPackaged ?? import.meta.url.includes(".asar/");
  const resourcesPath =
    args.resourcesPath ?? (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  const pathExists = args.existsSync ?? existsSync;

  if (isPackaged && resourcesPath) {
    const packagedBin = join(resourcesPath, PACKAGED_CLAUDE_BIN);
    if (pathExists(packagedBin)) return packagedBin;

    const unpackedBin = join(
      resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "bin",
      "claude.exe"
    );
    if (pathExists(unpackedBin)) return unpackedBin;
  }

  const requireResolve = args.requireResolve ?? ((id: string) => require.resolve(id));
  return requireResolve(CLAUDE_PACKAGE_BIN);
}

let cachedClaudeBin: string | null = null;

function getClaudeBinaryPath(): string {
  cachedClaudeBin ??= resolveClaudeBinaryPath();
  return cachedClaudeBin;
}

const PROMPT = (ticketKey: string, summary: string): string => `
You are converting a Jira ticket title into an English kebab-case branch slug.

Output rules:
- Output ONLY the slug. No prose, no quotes, no explanation.
- Lowercase ASCII a-z, digits 0-9, hyphens.
- Start with one of: feat, fix, chore, refactor, docs, test.
- 3-6 words after the prefix. Drop articles ("a", "the").
- Translate non-English titles to natural English first.

Ticket: ${ticketKey}
Summary: ${summary}

Slug:`;

/**
 * Jira 티켓 제목으로부터 영어 kebab-case 브랜치 슬러그를 생성한다.
 *
 * Claude Code CLI를 1턴 모드로 호출해 슬러그를 받고, 허용 문자만 남기도록 정제한다.
 *
 * @param args.ticketKey Jira 티켓 키 (예: PROJ-123)
 * @param args.summary 티켓 요약(원문)
 * @returns 정제된 슬러그 또는 에러 메시지
 */
export async function generateBranchSlug(args: {
  ticketKey: string;
  summary: string;
}): Promise<Result<{ slug: string }, { message: string }>> {
  try {
    const text = await runClaude(PROMPT(args.ticketKey, args.summary));
    const slug = text
      .trim()
      .split("\n")[0]!
      .replace(/[^a-z0-9-]/gi, "-")
      .toLowerCase()
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-");
    if (!slug) return err({ message: "empty slug from Claude Code SDK" });
    return ok({ slug });
  } catch (e) {
    return err({ message: (e as Error).message });
  }
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      getClaudeBinaryPath(),
      [
        "--print",
        "--output-format",
        "json",
        "--allowedTools",
        "",
        "--max-turns",
        "1",
        "--dangerously-skip-permissions",
        prompt,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`claude exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout) as { result?: string; text?: string };
        const text = parsed.result ?? parsed.text ?? stdout.trim();
        resolve(text);
      } catch {
        // 일반 텍스트 출력 폴백
        resolve(stdout.trim());
      }
    });
    proc.on("error", reject);
  });
}
