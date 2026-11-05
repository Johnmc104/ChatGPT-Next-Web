import {
  useCallback,
  useEffect,
  useRef,
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
import Locale from "../locales";

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
  const [attachImages, updateImages] = useState<string[]>([]);
  const images = useRef<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const pending = useRef(0);
  const context = `${session.id}:${model}:${providerName}`;
  const currentContext = useRef(context);
  currentContext.current = context;
  const currentLimit = useRef(maxAttachImages);
  currentLimit.current = maxAttachImages;
  const mounted = useRef(true);
  const submittedImages = useRef(new Set<string>());
  const setAttachImages: Dispatch<SetStateAction<string[]>> = useCallback(
    (updater) => {
      images.current =
        typeof updater === "function" ? updater(images.current) : updater;
      updateImages(images.current);
    },
    [],
  );

  useEffect(() => {
    pending.current = 0;
    setUploading(false);
    setFailedFiles([]);
    setImageError("");
  }, [context]);
  useEffect(() => {
    mounted.current = true;
    const protectedImages = submittedImages.current;
    return () => {
      mounted.current = false;
      images.current
        .filter((url) => !protectedImages.has(url))
        .forEach((url) => void releaseImageResource(url));
    };
  }, []);

  async function appendImageFiles(files: File[]) {
    if (!files.length) return;
    if (!maxAttachImages) {
      setImageError(Locale.Chat.Images.Unsupported);
      return;
    }
    const slots = Math.max(
      0,
      maxAttachImages - images.current.length - pending.current,
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
    if (!selected.length) return;
    pending.current += selected.length;
    setUploading(true);
    const startedContext = context;
    const results = await Promise.allSettled(
      selected.map((file) => uploadImageRemote(file)),
    );
    const urls = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    if (!mounted.current || currentContext.current !== startedContext) {
      urls.forEach((url) => void releaseImageResource(url));
      return;
    }
    pending.current -= selected.length;
    const remaining = Math.max(0, currentLimit.current - images.current.length);
    setAttachImages((previous) => [...previous, ...urls.slice(0, remaining)]);
    if (urls.length > remaining)
      setImageError(Locale.Chat.Images.Limit(currentLimit.current));
    urls.slice(remaining).forEach((url) => void releaseImageResource(url));
    const failed = selected.filter(
      (_file, index) => results[index].status === "rejected",
    );
    if (failed.length) {
      setFailedFiles((previous) => [...previous, ...failed]);
      setImageError(Locale.Chat.Images.Failed(failed.length));
    }
    setUploading(pending.current > 0);
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
  const removeImage = (index: number) => {
    if (!submittedImages.current.has(images.current[index]))
      void releaseImageResource(images.current[index]);
    setAttachImages((previous) => previous.filter((_image, i) => i !== index));
  };
  const clearImages = () => {
    images.current
      .filter((url) => !submittedImages.current.has(url))
      .forEach((url) => void releaseImageResource(url));
    setAttachImages([]);
    setFailedFiles([]);
    setImageError("");
  };
  const retryImages = () => {
    const slots = Math.max(
      0,
      currentLimit.current - images.current.length - pending.current,
    );
    if (!slots) {
      setImageError(Locale.Chat.Images.Limit(currentLimit.current));
      return;
    }
    const files = failedFiles.slice(0, slots);
    setFailedFiles(failedFiles.slice(slots));
    void appendImageFiles(files);
  };
  const beginImageSubmission = () => {
    const snapshot = [...images.current];
    snapshot.forEach((url) => submittedImages.current.add(url));
    return (accepted: boolean) => {
      snapshot.forEach((url) => {
        submittedImages.current.delete(url);
        if (!accepted && (!mounted.current || !images.current.includes(url)))
          void releaseImageResource(url);
      });
    };
  };
  return {
    beginImageSubmission,
    attachImages,
    maxAttachImages,
    setAttachImages,
    uploading,
    setUploading,
    handlePaste,
    handleDrop,
    uploadImage,
    appendImageFiles,
    removeImage,
    clearImages,
    retryImages,
    canRetryImages: failedFiles.length > 0,
    imageError:
      attachImages.length > maxAttachImages
        ? Locale.Chat.Images.Limit(maxAttachImages)
        : imageError,
  };
}
