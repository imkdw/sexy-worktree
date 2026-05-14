const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown"]);

export function isMarkdownFile(relativePath: string): boolean {
  const basename = relativePath.split("/").pop()?.toLowerCase() ?? "";
  const extension = basename.includes(".") ? basename.split(".").pop() : "";
  return extension ? MARKDOWN_EXTENSIONS.has(extension) : false;
}
