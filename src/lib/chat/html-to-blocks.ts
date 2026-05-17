import type { CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { ChatBlock } from "./types";

const BLOCK_TAGS = new Set([
  "article",
  "main",
  "section",
  "div",
  "body",
  "html",
  "details",
  "summary",
]);

const SKIP_TAGS = new Set([
  "script",
  "style",
  "noscript",
  "svg",
  "canvas",
  "iframe",
  "button",
  "input",
  "select",
  "textarea",
  "nav",
  "header",
  "footer",
  "aside",
]);

export function htmlToBlocks($: CheerioAPI, root: AnyNode | AnyNode[]): ChatBlock[] {
  const blocks = Array.isArray(root)
    ? root.flatMap((node) => nodeToBlocks($, node))
    : nodeToBlocks($, root);

  return compactBlocks(blocks);
}

export function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function nodeToBlocks($: CheerioAPI, node: AnyNode): ChatBlock[] {
  if (node.type === "text") {
    const text = normalizeText(node.data);
    return text ? [{ type: "paragraph", text }] : [];
  }

  if (node.type !== "tag") {
    return [];
  }

  const element = node as Element;
  const tag = element.name.toLowerCase();

  if (SKIP_TAGS.has(tag)) {
    return [];
  }

  if (/^h[1-6]$/.test(tag)) {
    const text = normalizeText($(element).text());
    return text
      ? [
          {
            type: "heading",
            level: Number(tag.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6,
            text,
          },
        ]
      : [];
  }

  if (tag === "pre") {
    const text = $(element).text().replace(/\n{3,}/g, "\n\n").trimEnd();
    const language = detectCodeLanguage($, element);
    return text ? [{ type: "code", code: text, language }] : [];
  }

  if (tag === "table") {
    const rows = $(element)
      .find("tr")
      .toArray()
      .map((row) =>
        $(row)
          .find("th,td")
          .toArray()
          .map((cell) => normalizeText($(cell).text())),
      )
      .filter((row) => row.some(Boolean));

    return rows.length ? [{ type: "table", rows }] : [];
  }

  if (tag === "ul" || tag === "ol") {
    const items = $(element)
      .children("li")
      .toArray()
      .map((item) => normalizeText($(item).text()))
      .filter(Boolean);

    return items.length ? [{ type: "list", ordered: tag === "ol", items }] : [];
  }

  if (tag === "blockquote") {
    const text = normalizeText($(element).text());
    return text ? [{ type: "quote", text }] : [];
  }

  if (tag === "p") {
    const text = normalizeText($(element).text());
    return text ? [{ type: "paragraph", text }] : [];
  }

  if (tag === "br") {
    return [];
  }

  const childBlocks = $(element)
    .contents()
    .toArray()
    .flatMap((child) => nodeToBlocks($, child));

  if (childBlocks.length || BLOCK_TAGS.has(tag)) {
    return childBlocks;
  }

  const text = normalizeText($(element).text());
  return text ? [{ type: "paragraph", text }] : [];
}

function detectCodeLanguage($: CheerioAPI, element: Element): string | undefined {
  const className =
    $(element).find("code").first().attr("class") ?? $(element).attr("class") ?? "";
  const match = className.match(/(?:language|lang)-([a-z0-9_+#.-]+)/i);

  return match?.[1];
}

function compactBlocks(blocks: ChatBlock[]): ChatBlock[] {
  const compacted: ChatBlock[] = [];

  for (const block of blocks) {
    if (block.type === "paragraph" && block.text.length < 2) {
      continue;
    }

    const previous = compacted.at(-1);
    if (
      previous?.type === "paragraph" &&
      block.type === "paragraph" &&
      previous.text === block.text
    ) {
      continue;
    }

    compacted.push(block);
  }

  return compacted;
}
