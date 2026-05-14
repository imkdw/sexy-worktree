export type HighlightTokenKind = "comment" | "keyword" | "number" | "plain" | "string" | "type";

export type HighlightSegment = {
  kind: HighlightTokenKind;
  text: string;
};

const CODE_TOKEN_RE =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|\b(?:abstract|as|async|await|break|case|catch|class|const|continue|debugger|declare|default|do|else|enum|export|extends|false|finally|for|from|function|get|if|implements|import|in|instanceof|interface|let|new|null|of|private|protected|public|readonly|return|satisfies|set|static|super|switch|this|throw|true|try|type|typeof|undefined|var|void|while|yield)\b|\b[A-Z][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b/g;

const SHELL_TOKEN_RE =
  /#[^\n]*|`(?:\\[\s\S]|[^`\\])*`|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|\b(?:case|do|done|elif|else|esac|export|fi|for|function|if|in|local|readonly|then|while)\b|\b\d+(?:\.\d+)?\b/g;

const MARKUP_TOKEN_RE =
  /<!--[\s\S]*?-->|<\/?[A-Za-z][^>\n]*>|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g;

const MARKDOWN_TOKEN_RE = /`[^`\n]*`|\*\*[^*\n]+\*\*|\bhttps?:\/\/[^\s)]+|^#{1,6}\s[^\n]*/gm;

const CODE_EXTENSIONS = new Set([
  "cjs",
  "css",
  "cts",
  "js",
  "jsx",
  "mjs",
  "mts",
  "prisma",
  "rs",
  "sql",
  "ts",
  "tsx",
]);

const SHELL_EXTENSIONS = new Set(["bash", "env", "fish", "sh", "zsh"]);
const MARKUP_EXTENSIONS = new Set(["html", "svg", "xml"]);
const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown"]);

export function highlightSource(source: string, relativePath: string): HighlightSegment[] {
  const language = detectLanguage(relativePath);
  if (language === "shell") return tokenize(source, SHELL_TOKEN_RE, classifyShellToken);
  if (language === "markup") return tokenize(source, MARKUP_TOKEN_RE, classifyMarkupToken);
  if (language === "markdown") return tokenize(source, MARKDOWN_TOKEN_RE, classifyMarkdownToken);
  if (language === "code") return tokenize(source, CODE_TOKEN_RE, classifyCodeToken);
  return source ? [{ kind: "plain", text: source }] : [];
}

function detectLanguage(relativePath: string): "code" | "markdown" | "markup" | "plain" | "shell" {
  const basename = relativePath.split("/").pop()?.toLowerCase() ?? "";
  const extension = basename.includes(".") ? basename.split(".").pop() : basename;

  if (basename === "dockerfile" || basename === "makefile") return "shell";
  if (extension && SHELL_EXTENSIONS.has(extension)) return "shell";
  if (extension && MARKUP_EXTENSIONS.has(extension)) return "markup";
  if (extension && MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
  if (extension && CODE_EXTENSIONS.has(extension)) return "code";
  if (basename === "package.json" || basename === "tsconfig.json") return "code";
  return "plain";
}

function tokenize(
  source: string,
  regex: RegExp,
  classify: (token: string) => HighlightTokenKind
): HighlightSegment[] {
  if (!source) return [];

  const segments: HighlightSegment[] = [];
  let lastIndex = 0;

  for (const match of source.matchAll(regex)) {
    const token = match[0];
    const index = match.index;
    if (index == null || !token) continue;

    if (index > lastIndex) {
      pushSegment(segments, "plain", source.slice(lastIndex, index));
    }
    pushSegment(segments, classify(token), token);
    lastIndex = index + token.length;
  }

  if (lastIndex < source.length) {
    pushSegment(segments, "plain", source.slice(lastIndex));
  }

  return segments;
}

function pushSegment(segments: HighlightSegment[], kind: HighlightTokenKind, text: string): void {
  if (!text) return;
  const previous = segments.at(-1);
  if (previous?.kind === kind) {
    previous.text += text;
    return;
  }
  segments.push({ kind, text });
}

function classifyCodeToken(token: string): HighlightTokenKind {
  if (token.startsWith("//") || token.startsWith("/*")) return "comment";
  if (isQuoted(token)) return "string";
  if (/^\d/.test(token)) return "number";
  if (/^[A-Z]/.test(token)) return "type";
  return "keyword";
}

function classifyShellToken(token: string): HighlightTokenKind {
  if (token.startsWith("#")) return "comment";
  if (isQuoted(token)) return "string";
  if (/^\d/.test(token)) return "number";
  return "keyword";
}

function classifyMarkupToken(token: string): HighlightTokenKind {
  if (token.startsWith("<!--")) return "comment";
  if (isQuoted(token)) return "string";
  return "keyword";
}

function classifyMarkdownToken(token: string): HighlightTokenKind {
  if (token.startsWith("#")) return "keyword";
  if (token.startsWith("`")) return "string";
  return "type";
}

function isQuoted(token: string): boolean {
  return token.startsWith('"') || token.startsWith("'") || token.startsWith("`");
}
