import { describe, expect, test } from "bun:test";
import { renderChatPdf } from "./pdf";
import type { ChatDocument } from "./types";

describe("renderChatPdf", () => {
  test("creates a PDF buffer from a structured chat document", async () => {
    const buffer = await renderChatPdf(sampleDocument);

    expect(buffer.byteLength).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  test("does not add duplicate blank pages when numbering a long PDF", async () => {
    const buffer = await renderChatPdf({
      ...sampleDocument,
      title: "Long conversion",
      messages: [
        {
          role: "assistant",
          blocks: Array.from({ length: 120 }, (_, index) => ({
            type: "paragraph",
            text: `Paragraph ${index + 1}. ${"Long rendered text ".repeat(80)}`,
          })),
        },
      ],
    });

    expect(countPdfPages(buffer)).toBeLessThanOrEqual(45);
  });
});

function countPdfPages(buffer: Buffer): number {
  return buffer.toString("latin1").match(/\/Type\s*\/Page\b/g)?.length ?? 0;
}

const sampleDocument: ChatDocument = {
  title: "Sample conversion",
  sourceUrl: "https://chatgpt.com/share/sample",
  provider: "chatgpt",
  capturedAt: "2026-05-17T17:00:00.000Z",
  rawTextLength: 200,
  warnings: [],
  messages: [
    {
      role: "user",
      blocks: [{ type: "paragraph", text: "Make this easy to download." }],
    },
    {
      role: "assistant",
      blocks: [
        { type: "heading", level: 2, text: "Result" },
        { type: "paragraph", text: "The PDF keeps the conversation structured." },
        { type: "code", language: "ts", code: "const ready = true;" },
        {
          type: "table",
          rows: [
            ["Format", "Status"],
            ["Code", "Kept"],
            ["Tables", "Kept"],
          ],
        },
      ],
    },
  ],
};
