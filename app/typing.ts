export type Updater<T> = (updater: (value: T) => void) => void;

export const ROLES = ["system", "user", "assistant"] as const;
export type MessageRole = (typeof ROLES)[number];

export interface RequestMessage {
  role: MessageRole;
  content: string;
}

export type DalleSize = "1024x1024" | "1792x1024" | "1024x1792";
export type DalleQuality = "standard" | "hd";
export type ImageQuality = DalleQuality | "low" | "medium" | "high" | "auto";
export type DalleStyle = "vivid" | "natural";
export type ImageOutputFormat = "png" | "jpeg" | "webp";

export type ModelSize =
  | "1024x1024"
  | "1792x1024"
  | "1024x1792"
  | "1024x1536"
  | "1536x1024"
  | "768x1344"
  | "864x1152"
  | "1344x768"
  | "1152x864"
  | "1440x720"
  | "720x1440"
  | "2048x2048"
  | "2048x1152"
  | "1152x2048"
  | "3840x2160"
  | "2160x3840"
  | "auto";
