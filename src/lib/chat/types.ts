export type ChatProvider = "chatgpt" | "gemini" | "claude" | "generic";

export type ChatRole = "user" | "assistant" | "system" | "tool" | "unknown";

export type ChatBlock =
  | {
      type: "heading";
      level: 1 | 2 | 3 | 4 | 5 | 6;
      text: string;
    }
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "quote";
      text: string;
    }
  | {
      type: "code";
      code: string;
      language?: string;
    }
  | {
      type: "list";
      ordered: boolean;
      items: string[];
    }
  | {
      type: "table";
      rows: string[][];
    };

export type ChatMessage = {
  role: ChatRole;
  label?: string;
  blocks: ChatBlock[];
};

export type ChatDocument = {
  title: string;
  sourceUrl: string;
  provider: ChatProvider;
  capturedAt: string;
  messages: ChatMessage[];
  rawTextLength: number;
  warnings: string[];
};
