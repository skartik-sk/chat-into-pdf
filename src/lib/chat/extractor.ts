import { load } from "cheerio";
import type { AnyNode } from "domhandler";
import { htmlToBlocks, normalizeText } from "./html-to-blocks";
import { markdownToBlocks } from "./markdown-to-blocks";
import { parseSourceUrl } from "./url";
import type { ChatBlock, ChatDocument, ChatMessage, ChatProvider, ChatRole } from "./types";

type FetchLike = (input: URL | string, init?: RequestInit) => Promise<Response>;

const CHATGPT_SELECTOR = "[data-message-author-role]";
const FETCH_TIMEOUT_MS = 18_000;
const MAX_SCRIPT_TEXT_CANDIDATES = 60;

export async function extractChatFromUrl(input: unknown, fetcher: FetchLike = fetch): Promise<ChatDocument> {
  const url = parseSourceUrl(input);
  const html = await fetchHtml(url, fetcher);
  const $ = load(html);
  const provider = detectProvider(url, html);
  const initialTitle = extractTitle($, provider);
  const warnings: string[] = [];

  const extractedMessages =
    extractChatGptMessages($) ??
    (provider === "chatgpt" ? extractChatGptEmbeddedMessages($) : null) ??
    extractProviderReadableBlocks($, provider) ??
    extractProviderHints($, provider) ??
    (provider === "generic" || provider === "claude" ? extractGenericReadableBlocks($) : null) ??
    (provider === "chatgpt" || provider === "generic" ? extractScriptTextFallback($) : null);

  if (!extractedMessages?.length) {
    if (provider === "gemini") {
      throw new Error(
        "Gemini did not expose readable chat text in this page load, so I stopped instead of making a fake PDF from Gemini app data.",
      );
    }

    throw new Error("I could not find readable chat content on that page.");
  }

  const messages = extractedMessages;

  if (messages.length === 1 && messages[0]?.role === "unknown") {
    warnings.push("The page did not expose clear chat roles, so the PDF uses a readable page capture.");
  }

  return {
    title: refineTitle(initialTitle, provider, messages),
    sourceUrl: url.toString(),
    provider,
    capturedAt: new Date().toISOString(),
    messages,
    rawTextLength: normalizeText($("body").text()).length,
    warnings,
  };
}

async function fetchHtml(url: URL, fetcher: FetchLike): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 ChatIntoPdf/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`The page returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      throw new Error("That URL did not return an HTML page.");
    }

    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("The page took too long to load.");
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function detectProvider(url: URL, html: string): ChatProvider {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const combined = `${host} ${url.pathname} ${html.slice(0, 5000).toLowerCase()}`;

  if (combined.includes("chatgpt") || combined.includes("openai.com/share")) {
    return "chatgpt";
  }

  if (
    host === "gemini.google.com" ||
    host.endsWith(".gemini.google.com") ||
    host === "bard.google.com" ||
    (host === "g.co" && path.startsWith("/gemini")) ||
    combined.includes("gemini.google") ||
    combined.includes("bard.google")
  ) {
    return "gemini";
  }

  if (host === "claude.ai" || host.endsWith(".claude.ai") || combined.includes("claude")) {
    return "claude";
  }

  return "generic";
}

function extractTitle($: ReturnType<typeof load>, provider: ChatProvider): string {
  const metaTitle =
    $('meta[property="og:title"]').attr("content") ??
    $('meta[name="twitter:title"]').attr("content") ??
    $("title").first().text();

  const cleanedTitle = normalizeText(metaTitle)
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\s+\|\s+(ChatGPT|Claude|Gemini)$/i, "");
  const title = provider === "gemini" ? cleanedTitle.replace(/^Gemini\s*[-–]\s*/i, "") : cleanedTitle;

  if (title && !/^chatgpt$|^gemini$/i.test(title)) {
    return title;
  }

  return provider === "chatgpt"
    ? "ChatGPT conversation"
    : provider === "gemini"
      ? "Gemini conversation"
      : provider === "claude"
        ? "Claude conversation"
        : "Captured chat";
}

function refineTitle(title: string, provider: ChatProvider, messages: ChatMessage[]): string {
  const normalized = title.trim();
  if (!isGenericShareTitle(normalized, provider)) {
    return normalized;
  }

  const generated = titleFromMessages(messages);
  return generated ?? normalized;
}

function isGenericShareTitle(title: string, provider: ChatProvider): boolean {
  const normalized = title.toLowerCase().replace(/[’']/g, "'").trim();

  return (
    normalized === "see what this chat's about" ||
    normalized === "shared chat" ||
    normalized === "captured chat" ||
    normalized === `${provider} conversation` ||
    normalized === "chatgpt conversation" ||
    normalized === "gemini conversation" ||
    normalized === "claude conversation"
  );
}

function titleFromMessages(messages: ChatMessage[]): string | null {
  const firstUserText = messages
    .find((message) => message.role === "user")
    ?.blocks.map(blockToPlainText)
    .join(" ");

  const firstHeading = messages
    .flatMap((message) => message.blocks)
    .find((block) => block.type === "heading");

  const sourceText = normalizeText(firstUserText ?? (firstHeading?.type === "heading" ? firstHeading.text : "")).replace(
    /([0-9])([A-Z])/g,
    "$1 $2",
  );
  if (!sourceText) {
    return null;
  }

  const topicMatches = [
    ...sourceText.matchAll(/\b([A-Z][A-Za-z][A-Za-z0-9 /&+-]{2,58}?)\s*:/g),
  ]
    .map((match) => cleanTitleFragment(match[1]))
    .filter(Boolean)
    .filter((fragment) => !/^(introduction|applications?|types?)$/i.test(fragment));

  const uniqueTopics = Array.from(new Set(topicMatches)).slice(0, 3);
  if (uniqueTopics.length >= 2) {
    return uniqueTopics.join(" & ");
  }

  if (uniqueTopics.length === 1) {
    return uniqueTopics[0];
  }

  const sentence = sourceText.split(/[.!?\n]/)[0] ?? sourceText;
  return cleanTitleFragment(sentence).slice(0, 82).replace(/\s+\S*$/, "") || null;
}

function cleanTitleFragment(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "")
    .replace(/\b(and|or|with|for|of|the|a|an)$/i, "")
    .trim();
}

function extractChatGptMessages($: ReturnType<typeof load>): ChatMessage[] | null {
  const nodes = $(CHATGPT_SELECTOR).toArray();
  if (!nodes.length) {
    return null;
  }

  const messages = nodes
    .map((node): ChatMessage | null => {
      const role = normalizeRole($(node).attr("data-message-author-role"));
      const blocks = htmlToBlocks($, node);

      return blocks.length ? { role, blocks } : null;
    })
    .filter((message): message is ChatMessage => Boolean(message));

  return messages.length ? mergeAdjacentRoleMessages(messages) : null;
}

function extractChatGptEmbeddedMessages($: ReturnType<typeof load>): ChatMessage[] | null {
  const payloads = extractReactRouterPayloads($);

  for (const payload of payloads) {
    const sharedData = findSharedConversationData(payload);
    const linearConversation = sharedData?.linear_conversation;

    if (!Array.isArray(linearConversation)) {
      continue;
    }

    const messages = linearConversation
      .map((node): ChatMessage | null => {
        const message = isRecord(node) ? node.message : null;
        if (!isRecord(message)) {
          return null;
        }

        const role = normalizeRole(readStringPath(message, ["author", "role"]));
        if (role === "system") {
          return null;
        }

        const parts = readArrayPath(message, ["content", "parts"]).filter(
          (part): part is string => typeof part === "string" && part.trim().length > 0,
        );

        if (!parts.length) {
          return null;
        }

        const blocks = parts.flatMap((part) => markdownToBlocks(part));
        return blocks.length ? { role, blocks } : null;
      })
      .filter((message): message is ChatMessage => Boolean(message));

    if (messages.length) {
      return messages;
    }
  }

  return null;
}

function extractReactRouterPayloads($: ReturnType<typeof load>): unknown[] {
  const payloads: unknown[] = [];
  const streamPattern = /streamController\.enqueue\("((?:\\.|[^"\\])*)"\)/g;

  $("script").each((_, script) => {
    const source = $(script).text();
    for (const match of source.matchAll(streamPattern)) {
      try {
        const jsonText = JSON.parse(`"${match[1]}"`) as string;
        const table = JSON.parse(jsonText) as unknown[];
        payloads.push(decodeReactRouterTable(table));
      } catch {
        // Ignore unrelated stream chunks.
      }
    }
  });

  return payloads;
}

function decodeReactRouterTable(table: unknown[]): unknown {
  const cache = new Map<number, unknown>();

  const dereference = (index: number): unknown => {
    if (index < 0 || index >= table.length) {
      return null;
    }

    if (cache.has(index)) {
      return cache.get(index);
    }

    cache.set(index, null);
    const decoded = decodeValue(table[index]);
    cache.set(index, decoded);
    return decoded;
  };

  const decodeKey = (key: string): string => {
    const match = key.match(/^_(\d+)$/);
    return match ? String(dereference(Number(match[1]))) : key;
  };

  const decodeValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => (typeof item === "number" ? dereference(item) : decodeValue(item)));
    }

    if (isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          decodeKey(key),
          typeof item === "number" ? dereference(item) : decodeValue(item),
        ]),
      );
    }

    return value;
  };

  return dereference(0);
}

function findSharedConversationData(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) {
    if (Array.isArray(value.linear_conversation) && isRecord(value.mapping)) {
      return value;
    }

    for (const item of Object.values(value)) {
      const found = findSharedConversationData(item);
      if (found) {
        return found;
      }
    }
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSharedConversationData(item);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function extractProviderHints($: ReturnType<typeof load>, provider: ChatProvider): ChatMessage[] | null {
  if (provider === "generic") {
    return null;
  }

  const selectors =
    provider === "gemini"
      ? [
          '[data-test-id*="conversation"]',
          '[data-test-id*="response"]',
          '[class*="conversation"]',
          '[class*="model-response"]',
          '[class*="query-text"]',
        ]
      : provider === "claude"
        ? [
            '[data-testid*="conversation"]',
            '[data-testid*="message"]',
            '[class*="conversation"]',
            '[class*="font-claude-message"]',
          ]
      : ['[class*="conversation"]', '[class*="message"]', "[data-testid*=conversation]"];

  const seen = new Set<string>();
  const messages: ChatMessage[] = [];

  for (const selector of selectors) {
    $(selector).each((_, node) => {
      const blocks = htmlToBlocks($, node);
      const textKey = blocksToText(blocks).slice(0, 500);

      if (!blocks.length || textKey.length < 12 || seen.has(textKey)) {
        return;
      }

      seen.add(textKey);
      messages.push({ role: inferRoleFromNode($, node), blocks });
    });
  }

  return messages.length ? mergeAdjacentRoleMessages(messages) : null;
}

function extractProviderReadableBlocks($: ReturnType<typeof load>, provider: ChatProvider): ChatMessage[] | null {
  if (provider !== "claude") {
    return null;
  }

  return extractReadableRoot($, [
    "#markdown-artifact",
    ".standard-markdown",
    "[data-testid*=artifact]",
  ], "Claude capture");
}

function extractGenericReadableBlocks($: ReturnType<typeof load>): ChatMessage[] | null {
  return extractReadableRoot(
    $,
    ["main", "article", '[role="main"]', "body"],
    "Page capture",
  );
}

function extractReadableRoot(
  $: ReturnType<typeof load>,
  selectors: string[],
  label: string,
): ChatMessage[] | null {
  const root =
    selectors
      .map((selector) => $(selector).first().get(0))
      .find((node): node is AnyNode => Boolean(node)) ?? null;

  if (!root) {
    return null;
  }

  const blocks = htmlToBlocks($, root).filter((block) => blocksToText([block]).length > 1);
  const readableText = blocksToText(blocks);

  if (blocks.length < 2 || readableText.length < 80) {
    return null;
  }

  return [{ role: "unknown", label, blocks }];
}

function extractScriptTextFallback($: ReturnType<typeof load>): ChatMessage[] | null {
  const textCandidates: string[] = [];

  $("script").each((_, script) => {
    const scriptText = $(script).text();
    collectReadableStrings(scriptText, textCandidates);
  });

  const blocks: ChatBlock[] = uniqueStrings(textCandidates)
    .slice(0, MAX_SCRIPT_TEXT_CANDIDATES)
    .map((text) => ({ type: "paragraph", text }));

  return blocks.length ? [{ role: "unknown", label: "Embedded chat data", blocks }] : null;
}

function collectReadableStrings(source: string, target: string[]): void {
  const decoded = source
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\u0026/g, "&");

  const quotedStrings = decoded.match(/"([^"\\]*(?:\\.[^"\\]*)*)"/g) ?? [];

  for (const quoted of quotedStrings) {
    const value = normalizeText(quoted.slice(1, -1).replace(/\\"/g, '"').replace(/\\n/g, "\n"));
    if (isReadableCandidate(value)) {
      target.push(value);
    }
  }
}

function isReadableCandidate(value: string): boolean {
  if (value.length < 24 || value.length > 4000) {
    return false;
  }

  if (/^[a-z0-9_$./:-]+$/i.test(value)) {
    return false;
  }

  if (/^https?:\/\//i.test(value) || value.includes("__next") || value.includes("webpack")) {
    return false;
  }

  return /[a-z]{3,}/i.test(value) && /\s/.test(value);
}

function normalizeRole(role: string | undefined): ChatRole {
  const normalized = role?.toLowerCase();

  if (normalized === "user" || normalized === "assistant" || normalized === "system" || normalized === "tool") {
    return normalized;
  }

  return "unknown";
}

function inferRoleFromNode($: ReturnType<typeof load>, node: AnyNode): ChatRole {
  const label = `${$(node).attr("aria-label") ?? ""} ${$(node).attr("class") ?? ""}`.toLowerCase();

  if (label.includes("user") || label.includes("query") || label.includes("prompt")) {
    return "user";
  }

  if (label.includes("assistant") || label.includes("model") || label.includes("response") || label.includes("answer")) {
    return "assistant";
  }

  return "unknown";
}

function mergeAdjacentRoleMessages(messages: ChatMessage[]): ChatMessage[] {
  const merged: ChatMessage[] = [];

  for (const message of messages) {
    const previous = merged.at(-1);
    if (previous && previous.role === message.role && previous.label === message.label) {
      previous.blocks.push(...message.blocks);
    } else {
      merged.push({ ...message, blocks: [...message.blocks] });
    }
  }

  return merged;
}

function blocksToText(blocks: ChatBlock[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "code":
          return block.code;
        case "list":
          return block.items.join("\n");
        case "table":
          return block.rows.map((row) => row.join(" ")).join("\n");
        default:
          return block.text;
      }
    })
    .join("\n")
    .trim();
}

function blockToPlainText(block: ChatBlock): string {
  switch (block.type) {
    case "code":
      return block.code;
    case "list":
      return block.items.join(" ");
    case "table":
      return block.rows.flat().join(" ");
    default:
      return block.text;
  }
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringPath(value: Record<string, unknown>, path: string[]): string | undefined {
  const result = readPath(value, path);
  return typeof result === "string" ? result : undefined;
}

function readArrayPath(value: Record<string, unknown>, path: string[]): unknown[] {
  const result = readPath(value, path);
  return Array.isArray(result) ? result : [];
}

function readPath(value: unknown, path: string[]): unknown {
  return path.reduce<unknown>((current, key) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[key];
  }, value);
}
