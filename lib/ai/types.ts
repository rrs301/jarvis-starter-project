export type ChatTurn = { role: "user" | "assistant"; content: string };

export type StreamRequest = {
  system: string;
  messages: ChatTurn[];
  model: string;
  maxTokens: number;
  /** "low" for quick answers; providers that support effort use it. */
  effort?: "low" | "medium" | "high";
  signal?: AbortSignal;
};

/** Every provider turns a request into a stream of text deltas. */
export type TextStreamer = (req: StreamRequest) => AsyncIterable<string>;
