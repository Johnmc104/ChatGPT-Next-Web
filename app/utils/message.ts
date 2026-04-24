import { RequestMessage } from "../client/api";

export function getMessageTextContent(message: RequestMessage) {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    // Guard against corrupt/unexpected content (e.g. raw API response objects)
    return typeof message.content === "object" && message.content !== null
      ? JSON.stringify(message.content)
      : String(message.content ?? "");
  }
  for (const c of message.content) {
    if (c.type === "text") {
      return c.text ?? "";
    }
  }
  return "";
}

export function getMessageTextContentWithoutThinking(message: RequestMessage) {
  let content = "";

  if (typeof message.content === "string") {
    content = message.content;
  } else if (Array.isArray(message.content)) {
    for (const c of message.content) {
      if (c.type === "text") {
        content = c.text ?? "";
        break;
      }
    }
  } else {
    content =
      typeof message.content === "object" && message.content !== null
        ? JSON.stringify(message.content)
        : String(message.content ?? "");
  }

  // New format: strip content between <!--THINKING--> and <!--/THINKING--> markers
  if (content.includes("<!--THINKING-->")) {
    return content
      .replace(/<!--THINKING-->[\s\S]*?<!--\/THINKING-->/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  // Backward compatibility: strip leading blockquote lines (old thinking format)
  const lines = content.split("\n");
  let thinkingEndIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("> ") || line.trim() === "") {
      thinkingEndIndex = i + 1;
    } else {
      break;
    }
  }

  if (thinkingEndIndex > 0) {
    const hasBlockquote = lines
      .slice(0, thinkingEndIndex)
      .some((l) => l.startsWith("> "));
    if (hasBlockquote) {
      return lines.slice(thinkingEndIndex).join("\n").trim();
    }
  }

  return content.trim();
}

export function getMessageImages(message: RequestMessage): string[] {
  if (typeof message.content === "string" || !Array.isArray(message.content)) {
    return [];
  }
  const urls: string[] = [];
  for (const c of message.content) {
    if (c.type === "image_url") {
      urls.push(c.image_url?.url ?? "");
    }
  }
  return urls;
}
