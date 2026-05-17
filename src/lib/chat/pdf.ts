import PDFDocument from "pdfkit";
import type { ChatBlock, ChatDocument, ChatMessage, ChatRole } from "./types";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const FOOTER_Y = PAGE_HEIGHT - MARGIN - 16;
const COLORS = {
  ink: "#17201c",
  muted: "#64706b",
  border: "#d9e4db",
  paper: "#fbfdf9",
  wash: "#eef8ef",
  washDark: "#dcefe2",
  accent: "#1f7a52",
  user: "#e9f4ff",
  assistant: "#eef8ef",
  code: "#15231d",
  codeText: "#ecfff4",
  tableHeader: "#e3f1e8",
};

export async function renderChatPdf(document: ChatDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: "A4",
      margin: MARGIN,
      bufferPages: true,
      info: {
        Title: document.title,
        Author: "Chat into PDF",
        Subject: document.sourceUrl,
      },
    });

    const chunks: Buffer[] = [];
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(Buffer.concat(chunks)));

    drawCover(pdf, document);
    document.messages.forEach((message, index) => drawMessage(pdf, message, index + 1));
    drawPageNumbers(pdf);
    pdf.end();
  });
}

function drawCover(pdf: PDFKit.PDFDocument, document: ChatDocument): void {
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(COLORS.paper);
  pdf
    .roundedRect(MARGIN - 14, MARGIN - 16, CONTENT_WIDTH + 28, 152, 18)
    .fillAndStroke(COLORS.wash, COLORS.border);

  pdf
    .font("Helvetica-Bold")
    .fontSize(26)
    .fillColor(COLORS.ink)
    .text(document.title, MARGIN, MARGIN + 8, {
      width: CONTENT_WIDTH,
      lineGap: 4,
    });

  pdf
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(providerLabel(document.provider).toUpperCase(), MARGIN, MARGIN + 96, {
      characterSpacing: 0.8,
    });

  pdf
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(`Captured ${formatDate(document.capturedAt)}`, MARGIN, MARGIN + 112);

  pdf
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(document.sourceUrl, MARGIN, MARGIN + 128, {
      width: CONTENT_WIDTH,
      ellipsis: true,
    });

  pdf.moveDown(4);
  pdf.y = MARGIN + 184;
}

function drawMessage(pdf: PDFKit.PDFDocument, message: ChatMessage, index: number): void {
  ensureSpace(pdf, 68);
  const startY = pdf.y;
  const color = message.role === "user" ? COLORS.user : COLORS.assistant;
  const role = message.label ?? roleLabel(message.role);
  const label = `${index.toString().padStart(2, "0")}  ${role}`;

  pdf.roundedRect(MARGIN, startY, CONTENT_WIDTH, 30, 8).fillAndStroke(color, COLORS.border);
  pdf
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.accent)
    .text(label.toUpperCase(), MARGIN + 14, startY + 10, {
      characterSpacing: 0.4,
      width: CONTENT_WIDTH - 28,
    });

  pdf.y = startY + 44;
  for (const block of message.blocks) {
    drawBlock(pdf, block);
  }

  pdf.moveDown(0.8);
}

function drawBlock(pdf: PDFKit.PDFDocument, block: ChatBlock): void {
  switch (block.type) {
    case "heading":
      drawHeading(pdf, block.text, block.level);
      break;
    case "paragraph":
      drawParagraph(pdf, block.text);
      break;
    case "quote":
      drawQuote(pdf, block.text);
      break;
    case "code":
      drawCode(pdf, block.code, block.language);
      break;
    case "list":
      drawList(pdf, block.items, block.ordered);
      break;
    case "table":
      drawTable(pdf, block.rows);
      break;
  }
}

function drawHeading(pdf: PDFKit.PDFDocument, text: string, level: number): void {
  const size = level <= 2 ? 15 : 12;
  const height = pdf.font("Helvetica-Bold").fontSize(size).heightOfString(text, { width: CONTENT_WIDTH });
  ensureSpace(pdf, height + 16);
  pdf.fillColor(COLORS.ink).text(text, MARGIN, pdf.y, { width: CONTENT_WIDTH, lineGap: 2 });
  pdf.moveDown(0.35);
}

function drawParagraph(pdf: PDFKit.PDFDocument, text: string): void {
  pdf.font("Helvetica").fontSize(10).fillColor(COLORS.ink);
  const height = pdf.heightOfString(text, { width: CONTENT_WIDTH, lineGap: 3 });
  ensureSpace(pdf, height + 12);
  pdf.text(text, MARGIN, pdf.y, { width: CONTENT_WIDTH, lineGap: 3 });
  pdf.moveDown(0.55);
}

function drawQuote(pdf: PDFKit.PDFDocument, text: string): void {
  pdf.font("Helvetica-Oblique").fontSize(10);
  const quoteWidth = CONTENT_WIDTH - 22;
  const height = pdf.heightOfString(text, { width: quoteWidth, lineGap: 3 }) + 18;
  ensureSpace(pdf, height + 8);
  const y = pdf.y;

  pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 6).fillAndStroke("#f5faf2", COLORS.border);
  pdf.rect(MARGIN, y, 4, height).fill(COLORS.accent);
  pdf.fillColor(COLORS.ink).text(text, MARGIN + 14, y + 9, { width: quoteWidth, lineGap: 3 });
  pdf.y = y + height + 8;
}

function drawCode(pdf: PDFKit.PDFDocument, code: string, language?: string): void {
  pdf.font("Courier").fontSize(8.6);
  const codeWidth = CONTENT_WIDTH - 20;
  const labelHeight = language ? 16 : 0;
  const height = Math.min(
    pdf.heightOfString(code, { width: codeWidth, lineGap: 2 }) + 22 + labelHeight,
    PAGE_HEIGHT - MARGIN * 2,
  );
  ensureSpace(pdf, Math.min(height + 10, PAGE_HEIGHT - MARGIN * 2));

  const y = pdf.y;
  pdf.roundedRect(MARGIN, y, CONTENT_WIDTH, height, 8).fill(COLORS.code);

  if (language) {
    pdf
      .font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor("#91d6ad")
      .text(language.toUpperCase(), MARGIN + 10, y + 9, { width: codeWidth });
  }

  pdf
    .font("Courier")
    .fontSize(8.6)
    .fillColor(COLORS.codeText)
    .text(code, MARGIN + 10, y + 11 + labelHeight, {
      width: codeWidth,
      lineGap: 2,
      continued: false,
    });

  pdf.y = y + height + 10;
}

function drawList(pdf: PDFKit.PDFDocument, items: string[], ordered: boolean): void {
  pdf.font("Helvetica").fontSize(10).fillColor(COLORS.ink);

  for (const [index, item] of items.entries()) {
    const prefix = ordered ? `${index + 1}.` : "•";
    const itemWidth = CONTENT_WIDTH - 24;
    const height = pdf.heightOfString(item, { width: itemWidth, lineGap: 3 });
    ensureSpace(pdf, height + 8);
    const y = pdf.y;

    pdf.font("Helvetica-Bold").text(prefix, MARGIN, y, { width: 18 });
    pdf.font("Helvetica").text(item, MARGIN + 24, y, { width: itemWidth, lineGap: 3 });
    pdf.y = y + height + 6;
  }

  pdf.moveDown(0.25);
}

function drawTable(pdf: PDFKit.PDFDocument, rows: string[][]): void {
  if (!rows.length) {
    return;
  }

  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const columnWidth = CONTENT_WIDTH / columnCount;
  const cellPadding = 6;

  pdf.font("Helvetica").fontSize(8.3);

  for (const [rowIndex, row] of rows.entries()) {
    const heights = Array.from({ length: columnCount }, (_, index) => {
      const text = row[index] ?? "";
      return pdf.heightOfString(text, {
        width: columnWidth - cellPadding * 2,
        lineGap: 2,
      });
    });
    const rowHeight = Math.max(24, Math.max(...heights) + cellPadding * 2);

    ensureSpace(pdf, rowHeight + 4);
    const y = pdf.y;

    for (let column = 0; column < columnCount; column += 1) {
      const x = MARGIN + column * columnWidth;
      pdf
        .rect(x, y, columnWidth, rowHeight)
        .fillAndStroke(rowIndex === 0 ? COLORS.tableHeader : "#ffffff", COLORS.border);
      pdf
        .font(rowIndex === 0 ? "Helvetica-Bold" : "Helvetica")
        .fontSize(8.3)
        .fillColor(COLORS.ink)
        .text(row[column] ?? "", x + cellPadding, y + cellPadding, {
          width: columnWidth - cellPadding * 2,
          lineGap: 2,
        });
    }

    pdf.y = y + rowHeight;
  }

  pdf.moveDown(0.8);
}

function ensureSpace(pdf: PDFKit.PDFDocument, required: number): void {
  if (pdf.y + required <= PAGE_HEIGHT - MARGIN) {
    return;
  }

  pdf.addPage();
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(COLORS.paper);
  pdf.y = MARGIN;
}

function drawPageNumbers(pdf: PDFKit.PDFDocument): void {
  const pages = pdf.bufferedPageRange();

  for (let index = 0; index < pages.count; index += 1) {
    pdf.switchToPage(index);
    pdf
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`Chat into PDF · ${index + 1}/${pages.count}`, MARGIN, FOOTER_Y, {
        width: CONTENT_WIDTH,
        align: "center",
        lineBreak: false,
      });
  }
}

function roleLabel(role: ChatRole): string {
  switch (role) {
    case "user":
      return "User";
    case "assistant":
      return "Assistant";
    case "system":
      return "System";
    case "tool":
      return "Tool";
    default:
      return "Captured content";
  }
}

function providerLabel(provider: ChatDocument["provider"]): string {
  switch (provider) {
    case "chatgpt":
      return "ChatGPT share";
    case "gemini":
      return "Gemini share";
    case "claude":
      return "Claude share";
    default:
      return "Readable chat page";
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
