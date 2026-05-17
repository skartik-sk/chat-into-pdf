import { isIP } from "node:net";

const PRIVATE_HOSTS = new Set(["localhost", "0.0.0.0"]);

export function parseSourceUrl(input: unknown): URL {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Paste a public ChatGPT, Gemini, or readable chat URL.");
  }

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("That does not look like a valid URL.");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Only http and https URLs can be converted.");
  }

  if (isBlockedHost(url.hostname)) {
    throw new Error("For safety, local and private network URLs are blocked.");
  }

  return url;
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (PRIVATE_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const parts = host.split(".").map((part) => Number(part));
    const [first, second] = parts;

    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 169 && second === 254)
    );
  }

  if (ipVersion === 6) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80");
  }

  return false;
}
