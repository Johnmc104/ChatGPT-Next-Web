import {
  useCallback,
  useEffect,
  useRef,
  useReducer,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useChatStore, useAppConfig } from "../store";
import {
  uploadImage as uploadImageRemote,
  releaseImageResource,
} from "../services/media/image";
import { isVisionModel } from "../utils/model-detection";
import { useModelInfo } from "../hooks/useModelInfo";
import { resolveModelCapabilities } from "../domain/model/resolve";
import { findCapabilityOverride } from "../domain/model/overrides";
import {
  createImageAttachment,
  imageAttachmentReducer,
  imageAttachmentUrls,
  type ImageAttachment,
} from "../domain/media/image-attachment";
import Locale from "../locales";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : Locale.Chat.Images.ReadFailed;
}

export function useChatImages() {
  const session = useChatStore().currentSession();
  const { model, providerName } = session.mask.modelConfig;
  const overrides = useAppConfig((state) => state.modelCapabilityOverrides);
  const { getModelInfo } = useModelInfo();
  const profile = resolveModelCapabilities(model, getModelInfo(model), {
    imageInput: isVisionModel(model, providerName),
    ...findCapabilityOverride(overrides ?? {}, model, providerName),
  });
  const maxAttachImages = profile.maxInputImages ?? 0;
  const [attachments, dispatch] = useReducer(imageAttachmentReducer, []);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const attachmentsRef = useRef<ImageAttachment[]>([]);
  const images = useRef<string[]>([]);
  const pending = useRef(0);
  const idCounter = useRef(0);
  const context = `${session.id}:${model}:${providerName}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  const currentLimit = useRef(maxAttachImages);
  currentLimit.current = maxAttachImages;
  const mounted = useRef(true);
  const submittedImages = useRef(new Set<string>());
  const removedAttachmentIds = useRef(new Set<string>());
  const previousSessionId = useRef(session.id);

  const draftAttachments = attachments.filter(
    (attachment) => attachment.owner === "draft",
  );
  const attachImages = imageAttachmentUrls(draftAttachments);
  attachmentsRef.current = attachments;
  images.current = attachImages;

  const setAttachImages: Dispatch<SetStateAction<string[]>> = useCallback(
    (updater) => {
      const current = imageAttachmentUrls(
        attachmentsRef.current.filter(
          (attachment) => attachment.owner === "draft",
        ),
      );
      const next = typeof updater === "function" ? updater(current) : updater;
      const nextUrls = new Set(next);
      attachmentsRef.current
        .filter(
          (attachment) =>
            attachment.owner === "draft" &&
            attachment.url &&
            !nextUrls.has(attachment.url) &&
            !submittedImages.current.has(attachment.url),
        )
        .forEach((attachment) => {
          if (attachment.url) void releaseImageResource(attachment.url);
          dispatch({ type: "remove", id: attachment.id });
        });
    },
    [],
  );

  useEffect(() => {
    if (previousSessionId.current === session.id) return;
    previousSessionId.current = session.id;
    pending.current = 0;
    setUploading(false);
    setImageError("");
    const protectedImages = submittedImages.current;
    attachmentsRef.current
      .filter(
        (attachment) =>
          attachment.owner === "draft" &&
          attachment.url &&
          !protectedImages.has(attachment.url),
      )
      .forEach((attachment) => {
        if (attachment.url) void releaseImageResource(attachment.url);
      });
    dispatch({ type: "clear" });
  }, [session.id]);

  useEffect(() => {
    mounted.current = true;
    const protectedImages = submittedImages.current;
    return () => {
      mounted.current = false;
      attachmentsRef.current
        .filter(
          (attachment) =>
            attachment.owner === "draft" &&
            attachment.url &&
            !protectedImages.has(attachment.url),
        )
        .forEach((attachment) => {
          if (attachment.url) void releaseImageResource(attachment.url);
        });
    };
  }, []);

  const uploadFiles = useCallback(
    async (files: File[], existingIds?: string[]) => {
      if (!files.length) return;
      const ids =
        existingIds ?? files.map(() => `image-${idCounter.current++}`);
      if (!existingIds) {
        files.forEach((file, index) =>
          dispatch({
            type: "enqueue",
            attachment: createImageAttachment(file, ids[index]),
          }),
        );
      }
      dispatch({ type: "uploading", ids });
      pending.current += files.length;
      setUploading(true);
      const startedContext = context;
      const results = await Promise.allSettled(
        files.map((file) => uploadImageRemote(file)),
      );
      pending.current = Math.max(0, pending.current - files.length);
      const stale =
        !mounted.current || currentContext.current !== startedContext;
      if (stale) {
        results.forEach((result) => {
          if (result.status === "fulfilled")
            void releaseImageResource(result.value);
        });
        ids.forEach((id) => {
          if (!removedAttachmentIds.current.has(id)) {
            dispatch({
              type: "failed",
              id,
              error: Locale.Chat.Images.ReadFailed,
            });
          }
        });
        setUploading(pending.current > 0);
        return;
      }

      let available = Math.max(
        0,
        currentLimit.current -
          imageAttachmentUrls(
            attachmentsRef.current.filter(
              (attachment) => attachment.owner === "draft",
            ),
          ).length,
      );
      let failureCount = 0;
      results.forEach((result, index) => {
        const id = ids[index];
        const wasRemoved = removedAttachmentIds.current.has(id);
        if (result.status === "fulfilled" && wasRemoved) {
          void releaseImageResource(result.value);
        } else if (result.status === "fulfilled" && available > 0) {
          dispatch({ type: "ready", id, url: result.value });
          available -= 1;
        } else if (result.status === "fulfilled") {
          void releaseImageResource(result.value);
          dispatch({ type: "remove", id });
          setImageError(Locale.Chat.Images.Limit(currentLimit.current));
        } else {
          failureCount += 1;
          dispatch({ type: "failed", id, error: errorMessage(result.reason) });
        }
      });
      if (failureCount) setImageError(Locale.Chat.Images.Failed(failureCount));
      setUploading(pending.current > 0);
    },
    [context],
  );

  async function appendImageFiles(files: File[]) {
    if (!files.length) return;
    if (!maxAttachImages) {
      setImageError(Locale.Chat.Images.Unsupported);
      return;
    }
    const slots = Math.max(
      0,
      maxAttachImages - attachImages.length - pending.current,
    );
    const valid = files.filter(
      (file) =>
        profile.acceptedImageTypes?.includes(file.type) &&
        file.size <= (profile.maxImageBytes ?? Infinity),
    );
    const selected = valid.slice(0, slots);
    setImageError(
      valid.length !== files.length
        ? Locale.Chat.Images.InvalidFiles
        : valid.length > slots
          ? Locale.Chat.Images.Limit(maxAttachImages)
          : "",
    );
    if (selected.length) await uploadFiles(selected);
  }

  const handlePaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.items).flatMap((item) => {
      const file =
        item.kind === "file" && item.type.startsWith("image/")
          ? item.getAsFile()
          : null;
      return file ? [file] : [];
    });
    if (files.length) {
      event.preventDefault();
      void appendImageFiles(files);
    }
  };
  const handleDrop = (event: React.DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.dataTransfer.files);
    if (files.length) {
      event.preventDefault();
      void appendImageFiles(files);
    }
  };
  const uploadImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = profile.acceptedImageTypes?.join(",") ?? "image/*";
    input.multiple = true;
    input.onchange = () => void appendImageFiles(Array.from(input.files ?? []));
    input.click();
  };
  const removeAttachment = (id: string) => {
    removedAttachmentIds.current.add(id);
    const attachment = attachmentsRef.current.find((item) => item.id === id);
    if (attachment?.url && !submittedImages.current.has(attachment.url))
      void releaseImageResource(attachment.url);
    dispatch({ type: "remove", id });
  };
  const removeImage = (index: number) => {
    const attachment = draftAttachments.filter((item) => item.url)[index];
    if (attachment) removeAttachment(attachment.id);
  };
  const clearImages = () => {
    attachmentsRef.current.forEach((attachment) =>
      removedAttachmentIds.current.add(attachment.id),
    );
    attachmentsRef.current
      .filter(
        (attachment) =>
          attachment.owner === "draft" &&
          attachment.url &&
          !submittedImages.current.has(attachment.url),
      )
      .forEach((attachment) => {
        if (attachment.url) void releaseImageResource(attachment.url);
      });
    dispatch({ type: "clear" });
    setImageError("");
  };
  const retryImages = () => {
    const failed = draftAttachments.filter(
      (attachment) => attachment.status === "failed" && attachment.file,
    );
    const slots = Math.max(
      0,
      currentLimit.current - attachImages.length - pending.current,
    );
    if (!slots) {
      setImageError(Locale.Chat.Images.Limit(currentLimit.current));
      return;
    }
    const retry = failed.slice(0, slots);
    if (retry.length)
      void uploadFiles(
        retry.map((attachment) => attachment.file!),
        retry.map((attachment) => attachment.id),
      );
  };
  const beginImageSubmission = () => {
    const snapshot = draftAttachments.filter((attachment) => attachment.url);
    const snapshotUrls = new Map(
      snapshot.map((attachment) => [attachment.id, attachment.url!]),
    );
    const ids = snapshot.map((attachment) => attachment.id);
    ids.forEach((id) => {
      const url = snapshotUrls.get(id);
      if (url) submittedImages.current.add(url);
    });
    dispatch({ type: "sending", ids });
    return (accepted: boolean) => {
      snapshot.forEach((attachment) => {
        const url = snapshotUrls.get(attachment.id);
        if (accepted) {
          dispatch({ type: "sent", ids: [attachment.id] });
          dispatch({ type: "remove", id: attachment.id });
          if (url) queueMicrotask(() => submittedImages.current.delete(url));
        } else {
          if (url) submittedImages.current.delete(url);
          if (url && (!mounted.current || !images.current.includes(url)))
            void releaseImageResource(url);
          if (url) dispatch({ type: "ready", id: attachment.id, url });
        }
      });
    };
  };
  return {
    beginImageSubmission,
    attachments: draftAttachments,
    attachImages,
    maxAttachImages,
    setAttachImages,
    uploading,
    setUploading,
    handlePaste,
    handleDrop,
    uploadImage,
    appendImageFiles,
    removeAttachment,
    removeImage,
    clearImages,
    retryImages,
    canRetryImages: draftAttachments.some(
      (attachment) => attachment.status === "failed",
    ),
    imageError:
      attachImages.length > maxAttachImages
        ? Locale.Chat.Images.Limit(maxAttachImages)
        : imageError,
  };
}
