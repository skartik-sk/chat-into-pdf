# ThreadPress

ThreadPress converts public AI chat share links into polished downloadable PDFs.

## What It Does

- Accepts public ChatGPT, Gemini, Claude, or generic readable page URLs.
- Extracts visible chat/article content top to bottom when the provider exposes readable share content.
- Preserves common formatting: headings, paragraphs, lists, quotes, code blocks, and tables.
- Generates a `.pdf` download with a cleaned filename.
- Stops with a clear error instead of making a fake PDF from hidden app shell data.

## Local Development

```bash
bun install
bun run dev
```

Open `http://localhost:3000`.

## Verification

```bash
bun test
bunx tsc --noEmit
bun run lint
bun run build
```

## Notes

Some Gemini share URLs only expose metadata and app shell scripts in server-rendered HTML. ThreadPress does not convert those into junk PDFs; it returns a clear error unless readable content is available.
