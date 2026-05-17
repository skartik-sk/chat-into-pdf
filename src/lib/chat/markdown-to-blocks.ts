import type { ChatBlock } from "./types";

export function markdownToBlocks(markdown: string): ChatBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: ChatBlock[] = [];
  let paragraph: string[] = [];
  let index = 0;

  const flushParagraph = () => {
    const text = paragraph.join(" ").trim();
    if (text) {
      blocks.push({ type: "paragraph", text });
    }
    paragraph = [];
  };

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed || trimmed === "---") {
      flushParagraph();
      index += 1;
      continue;
    }

    const fence = trimmed.match(/^```([a-z0-9_+#.-]*)/i);
    if (fence) {
      flushParagraph();
      const codeLines: string[] = [];
      index += 1;

      while (index < lines.length && !(lines[index] ?? "").trim().startsWith("```")) {
        codeLines.push(lines[index] ?? "");
        index += 1;
      }

      if (index < lines.length) {
        index += 1;
      }

      blocks.push({
        type: "code",
        language: fence[1] || undefined,
        code: codeLines.join("\n").trimEnd(),
      });
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        text: cleanInlineMarkdown(heading[2]),
      });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      flushParagraph();
      const tableLines: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().includes("|")) {
        const current = lines[index] ?? "";
        if (!/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(current)) {
          tableLines.push(current);
        }
        index += 1;
      }
      blocks.push({ type: "table", rows: tableLines.map(parseTableRow).filter((row) => row.length) });
      continue;
    }

    const listMatch = trimmed.match(/^((?:[-*+])|\d+[.)])\s+(.+)$/);
    if (listMatch) {
      flushParagraph();
      const ordered = /^\d/.test(listMatch[1]);
      const items: string[] = [];

      while (index < lines.length) {
        const item = (lines[index] ?? "").trim().match(/^((?:[-*+])|\d+[.)])\s+(.+)$/);
        if (!item || /^\d/.test(item[1]) !== ordered) {
          break;
        }
        items.push(cleanInlineMarkdown(item[2]));
        index += 1;
      }

      blocks.push({ type: "list", ordered, items });
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith(">")) {
        quoteLines.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: cleanInlineMarkdown(quoteLines.join(" ")) });
      continue;
    }

    paragraph.push(cleanInlineMarkdown(trimmed));
    index += 1;
  }

  flushParagraph();
  return blocks.filter((block) => block.type !== "table" || block.rows.length > 0);
}

function isTableStart(lines: string[], index: number): boolean {
  const current = lines[index] ?? "";
  const next = lines[index + 1] ?? "";

  return current.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(next);
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cleanInlineMarkdown(cell.trim()))
    .filter(Boolean);
}

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .trim();
}
