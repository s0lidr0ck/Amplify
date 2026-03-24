export function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function cleanTitleLine(line: string): string {
  return line.replace(/^\s{0,3}#{1,6}\s*/, "").replace(/\*\*/g, "").trim();
}

export function splitBlogMarkdown(markdown: string): { title: string; body: string } {
  const normalized = (markdown || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return { title: "", body: "" };
  const [firstLine = "", ...rest] = normalized.split("\n");
  return {
    title: cleanTitleLine(firstLine),
    body: rest.join("\n").replace(/^\s+/, ""),
  };
}

export function plainTextExcerpt(markdown: string, maxLength = 180): string {
  const text = (markdown || "")
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, "")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
    .replace(/[`#>*_\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trim()}...`;
}

export function isPreviewableImage(value: string): boolean {
  return /^https?:\/\//i.test(value);
}
