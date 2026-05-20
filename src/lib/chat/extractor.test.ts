import { describe, expect, test } from "bun:test";
import { extractChatFromUrl } from "./extractor";

const chatGptLikeHtml = `<!doctype html>
<html>
  <head>
    <title>Architecture plan | ChatGPT</title>
    <meta property="og:title" content="Architecture plan" />
  </head>
  <body>
    <main>
      <div data-message-author-role="user">
        <p>Can you compare these options?</p>
      </div>
      <div data-message-author-role="assistant">
        <h2>Comparison</h2>
        <p>Here is the structured answer.</p>
        <pre><code class="language-ts">const ok: boolean = true;</code></pre>
        <table>
          <tr><th>Choice</th><th>Cost</th></tr>
          <tr><td>A</td><td>Low</td></tr>
        </table>
        <ul><li>Keep the PDF readable.</li><li>Preserve tables.</li></ul>
      </div>
    </main>
  </body>
</html>`;

describe("extractChatFromUrl", () => {
  test("extracts ChatGPT-style messages with structured formatting", async () => {
    const document = await extractChatFromUrl("https://chatgpt.com/share/test", mockHtmlFetch(chatGptLikeHtml));

    expect(document.provider).toBe("chatgpt");
    expect(document.title).toBe("Architecture plan");
    expect(document.messages).toHaveLength(2);
    expect(document.messages[0]?.role).toBe("user");
    expect(document.messages[1]?.role).toBe("assistant");
    expect(document.messages[1]?.blocks.some((block) => block.type === "code")).toBe(true);
    expect(document.messages[1]?.blocks.some((block) => block.type === "table")).toBe(true);
    expect(document.messages[1]?.blocks.some((block) => block.type === "list")).toBe(true);
  });

  test("falls back to a readable page capture when roles are unavailable", async () => {
    const html = `<!doctype html><html><head><title>Shared chat</title></head><body>
      <main>
        <h1>Trip plan</h1>
        <p>This page has a long enough readable paragraph to become a PDF capture.</p>
        <p>The fallback should still return useful content instead of pretending the page is unsupported.</p>
      </main>
    </body></html>`;

    const document = await extractChatFromUrl("https://example.com/chat", mockHtmlFetch(html));

    expect(document.provider).toBe("generic");
    expect(document.messages).toHaveLength(1);
    expect(document.messages[0]?.label).toBe("Page capture");
    expect(document.warnings).toHaveLength(1);
  });

  test("extracts ChatGPT React Router share payloads", async () => {
    const html = `<!doctype html><html><head><title>ChatGPT - Embedded</title></head><body>
      <script>window.__reactRouterContext = { streamController: { enqueue(){} } };
      window.__reactRouterContext.streamController.enqueue(${JSON.stringify(JSON.stringify(chatGptStreamTable))});
      </script>
    </body></html>`;

    const document = await extractChatFromUrl("https://chatgpt.com/share/embedded", mockHtmlFetch(html));

    expect(document.title).toBe("ChatGPT - Embedded");
    expect(document.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(document.messages[1]?.blocks.some((block) => block.type === "heading")).toBe(true);
    expect(document.messages[1]?.blocks.some((block) => block.type === "table")).toBe(true);
    expect(document.messages[1]?.blocks.some((block) => block.type === "code")).toBe(true);
  });

  test("derives a useful PDF title when ChatGPT only exposes a generic share title", async () => {
    const html = `<!doctype html><html><head><title>See what this chat's about</title></head><body>
      <script>window.__reactRouterContext = { streamController: { enqueue(){} } };
      window.__reactRouterContext.streamController.enqueue(${JSON.stringify(JSON.stringify(genericTitleStreamTable))});
      </script>
    </body></html>`;

    const document = await extractChatFromUrl("https://chatgpt.com/share/generic-title", mockHtmlFetch(html));

    expect(document.title).toBe("Soft Computing & Artificial Intelligence");
  });

  test("recognizes Claude share links as their own provider", async () => {
    const html = `<!doctype html><html><head><title>Claude shared chat</title></head><body>
      <main>
        <h1>Refactor notes</h1>
        <p>This readable Claude share contains enough text to become a useful captured PDF document.</p>
        <p>The provider should be Claude instead of generic when the URL is on claude.ai.</p>
      </main>
    </body></html>`;

    const document = await extractChatFromUrl("https://claude.ai/share/test", mockHtmlFetch(html));

    expect(document.provider).toBe("claude");
    expect(document.messages).toHaveLength(1);
  });

  test("extracts Claude public artifact content before script app data", async () => {
    const html = `<!doctype html><html><head>
      <title>AI Model Parameter Counts: A Comprehensive Analysis | Claude</title>
      <meta property="og:title" content="AI Model Parameter Counts: A Comprehensive Analysis" />
    </head><body>
      <script>window.__next_f = ["Invite your team to Claude", "Upgrade your plan", "Claude app shell strings"];</script>
      <main>
        <div id="markdown-artifact">
          <div class="standard-markdown">
            <h1>AI Model Parameter Counts: A Comprehensive Analysis</h1>
            <p>This comprehensive analysis demonstrates that parameter counts provide useful benchmarks for comparing AI systems.</p>
            <table>
              <tr><th>Model</th><th>Parameters</th></tr>
              <tr><td>Claude example</td><td>Unknown</td></tr>
            </table>
          </div>
        </div>
      </main>
    </body></html>`;

    const document = await extractChatFromUrl("https://claude.ai/public/artifacts/test", mockHtmlFetch(html));
    const text = document.messages
      .flatMap((message) => message.blocks)
      .map((block) => {
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
      })
      .join("\n");

    expect(document.provider).toBe("claude");
    expect(document.title).toBe("AI Model Parameter Counts: A Comprehensive Analysis");
    expect(document.messages[0]?.label).toBe("Claude capture");
    expect(text).toContain("parameter counts provide useful benchmarks");
    expect(text).not.toContain("Upgrade your plan");
  });

  test("does not turn Gemini landing scripts into a fake chat PDF", async () => {
    const html = `<!doctype html><html><head>
      <title>‎Gemini - Retailer One Strategic Decisions</title>
      <meta property="og:title" content="‎Gemini - Retailer One Strategic Decisions" />
    </head><body>
      <script>window.WIZ_global_data = {
        "DnVkpd": "Generate an image of a futuristic car driving through an old mountain road surrounded by nature",
        "GtQXDc": "Give me caption options to tell the world about my new fur baby, Finn. Use emojis"
      };</script>
    </body></html>`;

    await expect(
      extractChatFromUrl("https://g.co/gemini/share/9798ddf30a47", mockHtmlFetch(html)),
    ).rejects.toThrow("Gemini did not expose readable chat text");
  });

  test("fetches Gemini share payloads from the public batch endpoint", async () => {
    const html = `<!doctype html><html><head>
      <title>‎Gemini - direct access to Google AI</title>
      <meta property="og:title" content="‎Gemini - direct access to Google AI" />
    </head><body><chat-app id="app-root"></chat-app></body></html>`;

    const document = await extractChatFromUrl(
      "https://gemini.google.com/share/2fd90c9b0e48",
      async (input, init) => {
        const target = input.toString();
        if (target.includes("/_/BardChatUi/data/batchexecute")) {
          expect(init?.method).toBe("POST");
          expect(String(init?.body)).toContain("f.req=");
          return new Response(geminiBatchResponse, {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }

        return new Response(html, {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      },
    );

    expect(document.provider).toBe("gemini");
    expect(document.title).toBe("Web Engineering Unit 1 Explained");
    expect(document.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(document.messages[0]?.blocks.some((block) => block.type === "paragraph")).toBe(true);
    expect(document.messages[1]?.blocks.some((block) => block.type === "table")).toBe(true);
    expect(document.messages[1]?.blocks.some((block) => block.type === "quote")).toBe(true);
  });
});

function mockHtmlFetch(html: string): (input: URL | string, init?: RequestInit) => Promise<Response> {
  return async () =>
    new Response(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
}

const chatGptStreamTable = [
  { _1: 2 },
  "loaderData",
  { _3: 4 },
  "routes/share.$shareId.($action)",
  { _5: 6 },
  "serverResponse",
  { _7: 8 },
  "data",
  { _9: 10, _11: 12, _13: 14 },
  "title",
  "Embedded",
  "mapping",
  {},
  "linear_conversation",
  [15, 30],
  { _16: 17 },
  "message",
  { _18: 19, _21: 22 },
  "author",
  { _20: 26 },
  "role",
  "content",
  { _23: 24, _25: 27 },
  "content_type",
  "text",
  "parts",
  "user",
  ["What changed?"],
  "assistant",
  "### Answer\n\n| Item | Status |\n| --- | --- |\n| PDF | Ready |\n\n```ts\nconst ready = true;\n```",
  { _16: 31 },
  { _18: 32, _21: 33 },
  { _20: 28 },
  { _23: 24, _25: 34 },
  [29],
];

const genericTitleStreamTable = [
  { _1: 2 },
  "loaderData",
  { _3: 4 },
  "routes/share.$shareId.($action)",
  { _5: 6 },
  "serverResponse",
  { _7: 8 },
  "data",
  { _9: 10, _11: 12, _13: 14 },
  "title",
  "See what this chat's about",
  "mapping",
  {},
  "linear_conversation",
  [15],
  { _16: 17 },
  "message",
  { _18: 19, _21: 22 },
  "author",
  { _20: 26 },
  "role",
  "content",
  { _23: 24, _25: 27 },
  "content_type",
  "text",
  "parts",
  "user",
  [
    "ok !1Soft Computing: Introduction and applications. Artificial Intelligence : production systems and search strategies.",
  ],
];

const geminiBatchPayload = [
  [
    null,
    [
      [
        ["conversation-id", "request-id"],
        null,
        [
          [
            "I have my paper. UNIT- I: Web Engineering: Introduction, History, Evolution and Need.",
            null,
            null,
            null,
            [[]],
          ],
          2,
          null,
          1,
          "client-id",
        ],
        [
          [
            [
              "response-id",
              [
                "### Web Engineering Fundamentals\n\n| Topic | Meaning |\n| --- | --- |\n| Web Engineering | Systematic web app development |\n\n<Image alt=\"TCP/IP diagram\" caption=\"TCP/IP Model Architecture\" src=\"image_agent_tag\" />",
              ],
            ],
          ],
          null,
          null,
          "response-id",
        ],
        [1779298076, 494323000],
      ],
    ],
    [true, "Web Engineering Unit 1 Explained", null, null, null, ["", "", ""], null, [2, "model-id", "3.1 Pro"]],
    "2fd90c9b0e48",
    [1779302933, 335948000],
  ],
  null,
  false,
];

const geminiBatchResponse = `)]}'

${JSON.stringify([["wrb.fr", "ujx1Bf", JSON.stringify(geminiBatchPayload), null, null, null, "generic"]])}
`;
