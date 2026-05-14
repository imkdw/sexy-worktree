import type { Terminal as XTerm } from "@xterm/xterm";

export const OPEN_MARKDOWN_PATH_EVENT = "app:open-markdown-path";

export type OpenMarkdownPathDetail = {
  worktreePath: string;
  relativePath: string;
};

type MarkdownPathLink = {
  text: string;
  relativePath: string;
  startIndex: number;
  endIndex: number;
};

type TerminalLine = {
  text: string;
  cellStartByIndex: number[];
  cellEndByIndex: number[];
};

const MARKDOWN_PATH_PATTERN =
  /(?:file:\/\/)?(?:~|\.{1,2}|\/|[A-Za-z0-9_.-])(?:[^\s`"'<>[\]{}|]*?\.md)(?::\d+(?::\d+)?)?/gi;

export function installMarkdownPathLinkProvider(term: XTerm, worktreePath: string): void {
  term.registerLinkProvider({
    provideLinks(bufferLineNumber, callback) {
      const line = readTerminalLine(term, bufferLineNumber);
      if (!line) {
        callback(undefined);
        return;
      }

      const matches = findMarkdownPathLinks(line.text, worktreePath);
      if (matches.length === 0) {
        callback(undefined);
        return;
      }

      callback(
        matches.map((match) => ({
          text: match.text,
          range: {
            start: {
              x: (line.cellStartByIndex[match.startIndex] ?? match.startIndex) + 1,
              y: bufferLineNumber,
            },
            end: {
              x: line.cellEndByIndex[match.endIndex - 1] ?? match.endIndex,
              y: bufferLineNumber,
            },
          },
          decorations: {
            pointerCursor: true,
            underline: true,
          },
          activate(event) {
            if (!event.metaKey) return;
            event.preventDefault();
            event.stopPropagation();
            window.dispatchEvent(
              new CustomEvent<OpenMarkdownPathDetail>(OPEN_MARKDOWN_PATH_EVENT, {
                detail: {
                  worktreePath,
                  relativePath: match.relativePath,
                },
              })
            );
          },
        }))
      );
    },
  });
}

export function findMarkdownPathLinks(lineText: string, worktreePath: string): MarkdownPathLink[] {
  const links: MarkdownPathLink[] = [];

  for (const match of lineText.matchAll(MARKDOWN_PATH_PATTERN)) {
    const raw = match[0];
    const matchIndex = match.index;
    if (matchIndex == null) continue;

    const markdownEndIndex = raw.toLowerCase().indexOf(".md");
    if (markdownEndIndex < 0) continue;

    const text = raw.slice(0, markdownEndIndex + ".md".length);
    const relativePath = resolveMarkdownRelativePath(raw, worktreePath);
    if (!relativePath) continue;

    links.push({
      text,
      relativePath,
      startIndex: matchIndex,
      endIndex: matchIndex + text.length,
    });
  }

  return links;
}

export function resolveMarkdownRelativePath(rawPath: string, worktreePath: string): string | null {
  let candidate = rawPath
    .trim()
    .replace(/^file:\/\//, "")
    .replace(/:\d+(?::\d+)?$/, "")
    .replace(/[.,;!?]+$/, "");

  try {
    candidate = decodeURI(candidate);
  } catch {
    // Keep the original candidate when percent decoding fails.
  }

  if (!candidate.toLowerCase().endsWith(".md")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return null;

  const normalizedWorktree = worktreePath.replace(/\/+$/, "");
  if (candidate.startsWith(`${normalizedWorktree}/`)) {
    return candidate.slice(normalizedWorktree.length + 1);
  }

  if (candidate.startsWith("/")) return null;

  const relative = candidate.replace(/^\.\/+/, "");
  if (!relative || relative.startsWith("../")) return null;
  return relative;
}

function readTerminalLine(term: XTerm, bufferLineNumber: number): TerminalLine | null {
  const line = term.buffer.active.getLine(bufferLineNumber - 1);
  if (!line) return null;

  const cell = term.buffer.active.getNullCell();
  let text = "";
  const cellStartByIndex: number[] = [];
  const cellEndByIndex: number[] = [];

  for (let cellIndex = 0; cellIndex < Math.min(line.length, term.cols); cellIndex += 1) {
    const current = line.getCell(cellIndex, cell);
    if (!current || current.getWidth() === 0) continue;

    const chars = current.getChars() || " ";
    const startIndex = text.length;
    text += chars;
    const endIndex = text.length;

    for (let index = startIndex; index < endIndex; index += 1) {
      cellStartByIndex[index] = cellIndex;
      cellEndByIndex[index] = cellIndex + Math.max(current.getWidth(), 1);
    }
  }

  const trimmedText = text.replace(/\s+$/, "");
  return {
    text: trimmedText,
    cellStartByIndex: cellStartByIndex.slice(0, trimmedText.length),
    cellEndByIndex: cellEndByIndex.slice(0, trimmedText.length),
  };
}
