import { describe, expect, test } from "bun:test";
import { markdownToBlocks } from "./markdown-to-blocks";

describe("markdownToBlocks", () => {
  test("keeps common chat formatting as structured blocks", () => {
    const blocks = markdownToBlocks(`# Title

Paragraph with **bold** text.

- One
- Two

| Name | Value |
| --- | --- |
| A | B |

\`\`\`js
console.log("ok");
\`\`\`
`);

    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "list", "table", "code"]);
  });
});
