import { describe, expect, test } from "bun:test";
import { parseSourceUrl } from "./url";

describe("parseSourceUrl", () => {
  test("accepts public http and https URLs", () => {
    expect(parseSourceUrl("https://chatgpt.com/share/example").hostname).toBe("chatgpt.com");
    expect(parseSourceUrl("http://example.com/chat").hostname).toBe("example.com");
  });

  test("rejects local and private URLs", () => {
    expect(() => parseSourceUrl("http://localhost:3000")).toThrow("local and private");
    expect(() => parseSourceUrl("http://127.0.0.1:3000")).toThrow("local and private");
    expect(() => parseSourceUrl("http://192.168.1.15/chat")).toThrow("local and private");
  });

  test("rejects non-web protocols", () => {
    expect(() => parseSourceUrl("file:///tmp/chat.html")).toThrow("Only http and https");
  });
});
