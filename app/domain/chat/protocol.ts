import type {
  ChatOptions,
  LLMConfig,
  MultimodalContent,
  RequestMessage,
} from "@/app/client/api";

export interface ChatRequest {
  messages: RequestMessage[];
  config: LLMConfig;
}

export interface ImageRequest {
  model: string;
  prompt: string;
  images?: string[];
  size?: LLMConfig["size"];
  quality?: LLMConfig["quality"];
  outputFormat?: LLMConfig["outputFormat"];
}

export type StreamEvent =
  | { type: "text"; content: string }
  | { type: "thinking"; content: string }
  | { type: "tool-call"; content: string; toolCallId?: string }
  | { type: "image"; content: MultimodalContent[] }
  | { type: "usage"; usage: NonNullable<ChatOptions["onFinish"]> extends (...args: infer A) => unknown ? A[2] : never }
  | { type: "done" }
  | { type: "error"; error: Error };
