import { useState, useCallback } from "react";
import { useChatStore } from "../store";
import { uploadImage as uploadImageRemote } from "@/app/utils/chat";
import { isVisionModel } from "../utils";

const MAX_ATTACH_IMAGES = 3;

export function useChatImages() {
  const chatStore = useChatStore();
  const [attachImages, setAttachImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  async function appendImageFiles(files: File[]) {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const results = await Promise.all(
        files.slice(0, MAX_ATTACH_IMAGES).map((f) => uploadImageRemote(f)),
      );
      setAttachImages((prev) => {
        const merged = [...prev, ...results];
        return merged.slice(0, MAX_ATTACH_IMAGES);
      });
    } catch (e) {
      console.error("[Image Upload] failed", e);
    } finally {
      setUploading(false);
    }
  }

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const currentModel = chatStore.currentSession().mask.modelConfig.model;
      if (!isVisionModel(currentModel)) {
        return;
      }
      const items = (event.clipboardData || window.clipboardData).items;
      const files: File[] = [];
      for (const item of items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          event.preventDefault();
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length > 0) {
        appendImageFiles(files);
      }
    },
    [chatStore],
  );

  async function uploadImage() {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept =
      "image/png, image/jpeg, image/webp, image/heic, image/heif";
    fileInput.multiple = true;
    fileInput.onchange = (event: any) => {
      const files: File[] = Array.from(event.target.files ?? []);
      appendImageFiles(files);
    };
    fileInput.click();
  }

  return {
    attachImages,
    setAttachImages,
    uploading,
    setUploading,
    handlePaste,
    uploadImage,
  };
}
