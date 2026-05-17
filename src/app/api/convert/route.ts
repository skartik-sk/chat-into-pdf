import { NextResponse } from "next/server";
import { extractChatFromUrl } from "@/lib/chat/extractor";
import { renderChatPdf } from "@/lib/chat/pdf";

export const runtime = "nodejs";
export const maxDuration = 45;

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { url?: unknown };
    const document = await extractChatFromUrl(body.url);
    const pdf = await renderChatPdf(document);
    const filename = makePdfFilename(document.title);

    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not convert that chat.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function makePdfFilename(title: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "chat";

  return `${slug}.pdf`;
}
