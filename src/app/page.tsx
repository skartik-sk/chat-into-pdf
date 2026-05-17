"use client";

import {
  ArrowDownToLine,
  Bot,
  FileText,
  Gem,
  LoaderCircle,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

type ConversionState = "idle" | "converting" | "ready" | "error";

const progressStages = [
  "1/4 Fetching the chat share...",
  "2/4 Reading the full chat top to bottom...",
  "3/4 Formatting code, tables, and lists into .pdf...",
  "4/4 Finalizing the .pdf filename...",
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<ConversionState>("idle");
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [filename, setFilename] = useState("chat.pdf");
  const [progressStep, setProgressStep] = useState(0);
  const statusMessage =
    state === "converting"
      ? progressStages[progressStep]
      : message || "Ready for a public share link.";

  useEffect(() => {
    return () => {
      if (downloadUrl) {
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }, [downloadUrl]);

  useEffect(() => {
    if (state !== "converting") {
      return;
    }

    const timer = window.setTimeout(() => {
      setProgressStep((step) => Math.min(step + 1, progressStages.length - 1));
    }, 700);

    return () => window.clearTimeout(timer);
  }, [progressStep, state]);

  async function convertChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("converting");
    setProgressStep(0);
    setMessage("");

    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl("");
    }

    try {
      const response = await fetch("/api/convert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not convert that link.");
      }

      const blob = await response.blob();
      const fileUrl = URL.createObjectURL(blob);
      const nextFilename = getFilename(response.headers.get("content-disposition"));

      setDownloadUrl(fileUrl);
      setFilename(nextFilename);
      setState("ready");
      setMessage(`Ready: ${nextFilename}`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Something went wrong.");
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--page)] text-[var(--ink)]">
      <div className="page-texture" aria-hidden="true" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-5 py-10 sm:px-8">
        <div className="mb-10 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="brand-mark">
              <FileText size={22} strokeWidth={1.8} />
            </div>
            <span className="font-display text-2xl font-semibold">ThreadPress</span>
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-[var(--line)] bg-white/70 px-4 py-2 text-xs font-semibold text-[var(--muted)] shadow-sm backdrop-blur sm:flex">
            <ShieldCheck size={15} />
            Public links only
          </div>
        </div>

        <div className="grid items-center gap-10 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="max-w-xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--mist)] px-4 py-2 text-xs font-bold uppercase text-[var(--green)]">
              <Sparkles size={14} />
              Chat to polished PDF
            </div>
            <h1 className="font-display text-5xl font-semibold leading-[1.02] sm:text-6xl">
              Save the whole chat as one clean document.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-[var(--muted)]">
              Public ChatGPT, Gemini, and Claude links are parsed when readable share content is exposed, then packed into a structured PDF with code, tables, lists, quotes, and headings.
            </p>
          </div>

          <form onSubmit={convertChat} className="converter-shell">
            <div
              className="grid grid-cols-3 gap-2"
              aria-label="Supported providers"
            >
              <span className="inline-flex min-w-0 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/75 px-3 py-2 text-xs font-extrabold text-[var(--green-dark)]">
                <MessageCircle size={14} />
                ChatGPT
              </span>
              <span className="inline-flex min-w-0 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/75 px-3 py-2 text-xs font-extrabold text-[var(--green-dark)]">
                <Gem size={14} />
                Gemini
              </span>
              <span className="inline-flex min-w-0 items-center justify-center gap-2 rounded-full border border-[var(--line)] bg-white/75 px-3 py-2 text-xs font-extrabold text-[var(--green-dark)]">
                <Bot size={14} />
                Claude
              </span>
            </div>
            <label htmlFor="chat-url" className="text-sm font-bold text-[var(--muted)]">
              Chat URL
            </label>
            <div className="input-glow">
              <input
                id="chat-url"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                type="url"
                required
                placeholder="https://chatgpt.com/share/..."
                className="url-input"
                disabled={state === "converting"}
              />
              <button type="submit" className="submit-button" disabled={state === "converting"}>
                {state === "converting" ? (
                  <LoaderCircle size={20} className="animate-spin" />
                ) : (
                  <Send size={19} />
                )}
                <span>{state === "converting" ? "Making .pdf" : "Make PDF"}</span>
              </button>
            </div>

            <div className="status-row" data-state={state}>
              <span>{statusMessage}</span>
            </div>
            {state === "converting" ? (
              <div className="progress-track" aria-label="PDF conversion progress">
                <span style={{ width: `${((progressStep + 1) / progressStages.length) * 100}%` }} />
              </div>
            ) : null}

            {downloadUrl ? (
              <a href={downloadUrl} download={filename} className="download-button">
                <ArrowDownToLine size={19} />
                <span>Download {filename}</span>
              </a>
            ) : null}

            <div className="format-strip" aria-label="PDF formatting supported">
              <span>Code</span>
              <span>Tables</span>
              <span>Lists</span>
              <span>Quotes</span>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}

function getFilename(contentDisposition: string | null): string {
  const match = contentDisposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? "chat.pdf";
}
