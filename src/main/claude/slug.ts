import { ok, err, type Result } from "@shared/result";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @anthropic-ai/claude-code는 JS 모듈이 아니라 컴파일된 바이너리 CLI다.
 *
 * `query`나 `SDKMessage` 같은 심볼을 export하지 않으며 네이티브 실행 파일로 배포된다.
 * 따라서 `-p`(--print) 플래그와 `--output-format json` 옵션으로 자식 프로세스를 띄워 호출한다.
 */

const CLAUDE_BIN = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
  "node_modules/.bin/claude"
);

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
      CLAUDE_BIN,
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
