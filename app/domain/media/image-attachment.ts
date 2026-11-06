export type ImageAttachmentStatus =
  "queued" | "uploading" | "ready" | "failed" | "sending" | "sent";

export type ImageAttachmentOwner = "draft" | "message";

export interface ImageAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
  status: ImageAttachmentStatus;
  owner: ImageAttachmentOwner;
  file?: File;
  url?: string;
  error?: string;
}

export type ImageAttachmentAction =
  | { type: "enqueue"; attachment: ImageAttachment }
  | { type: "uploading"; ids: string[] }
  | { type: "ready"; id: string; url: string }
  | { type: "failed"; id: string; error: string }
  | { type: "sending"; ids: string[] }
  | { type: "sent"; ids: string[] }
  | { type: "remove"; id: string }
  | { type: "clear"; keepIds?: string[] };

export function createImageAttachment(file: File, id: string): ImageAttachment {
  return {
    id,
    file,
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    status: "queued",
    owner: "draft",
  };
}

export function imageAttachmentReducer(
  state: ImageAttachment[],
  action: ImageAttachmentAction,
): ImageAttachment[] {
  switch (action.type) {
    case "enqueue":
      return [...state, action.attachment];
    case "uploading":
      return state.map((attachment) =>
        action.ids.includes(attachment.id)
          ? { ...attachment, status: "uploading", error: undefined }
          : attachment,
      );
    case "ready":
      return state.map((attachment) =>
        attachment.id === action.id
          ? {
              ...attachment,
              status: "ready",
              url: action.url,
              error: undefined,
            }
          : attachment,
      );
    case "failed":
      return state.map((attachment) =>
        attachment.id === action.id
          ? { ...attachment, status: "failed", error: action.error }
          : attachment,
      );
    case "sending":
      return state.map((attachment) =>
        action.ids.includes(attachment.id)
          ? { ...attachment, status: "sending" }
          : attachment,
      );
    case "sent":
      return state.map((attachment) =>
        action.ids.includes(attachment.id)
          ? { ...attachment, status: "sent", owner: "message" }
          : attachment,
      );
    case "remove":
      return state.filter((attachment) => attachment.id !== action.id);
    case "clear": {
      const keep = new Set(action.keepIds ?? []);
      return state.filter((attachment) => keep.has(attachment.id));
    }
    default:
      return state;
  }
}

export function imageAttachmentUrls(attachments: ImageAttachment[]): string[] {
  return attachments.flatMap((attachment) =>
    attachment.url && ["ready", "sending", "sent"].includes(attachment.status)
      ? [attachment.url]
      : [],
  );
}

export function imageAttachmentIdsForSubmission(
  attachments: ImageAttachment[],
): string[] {
  return attachments
    .filter((attachment) => attachment.status === "ready")
    .map((attachment) => attachment.id);
}
