import { CACHE_URL_PREFIX, UPLOAD_URL } from "@/app/constant";
import {
  MultimodalContent,
  RequestMessage,
} from "@/app/client/api";

export function compressImage(file: Blob, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent: ProgressEvent<FileReader>) => {
      const image = new Image();
      image.onload = () => {
        let canvas = document.createElement("canvas");
        let ctx = canvas.getContext("2d");
        let width = image.width;
        let height = image.height;
        let quality = 0.9;
        let dataUrl;

        do {
          canvas.width = width;
          canvas.height = height;
          ctx?.clearRect(0, 0, canvas.width, canvas.height);
          ctx?.drawImage(image, 0, 0, width, height);
          dataUrl = canvas.toDataURL("image/jpeg", quality);

          if (dataUrl.length < maxSize) break;

          if (quality > 0.5) {
            // Prioritize quality reduction
            quality -= 0.1;
          } else {
            // Then reduce the size
            width *= 0.9;
            height *= 0.9;
          }
        } while (dataUrl.length > maxSize);

        resolve(dataUrl);
      };
      image.onerror = reject;
      image.src = readerEvent.target?.result as string;
    };
    reader.onerror = reject;

    if (file.type.includes("heic")) {
      try {
        const heic2any = require("heic2any");
        heic2any({ blob: file, toType: "image/jpeg" })
          .then((blob: Blob) => {
            reader.readAsDataURL(blob);
          })
          .catch((e: Error) => {
            reject(e);
          });
      } catch (e) {
        reject(e);
      }
    }

    reader.readAsDataURL(file);
  });
}

export async function preProcessImageContentBase(
  content: RequestMessage["content"],
  transformImageUrl: (url: string) => Promise<MultimodalContent>,
) {
  if (typeof content === "string") {
    return content;
  }
  const result = [];
  for (const part of content) {
    if (part?.type == "image_url" && part?.image_url?.url) {
      try {
        const url = await cacheImageToBase64Image(part?.image_url?.url);
        result.push(await transformImageUrl(url));
      } catch (error) {
        console.error("Error processing image URL:", error);
      }
    } else {
      result.push({ ...part });
    }
  }
  return result;
}

export async function preProcessImageContent(
  content: RequestMessage["content"],
) {
  return preProcessImageContentBase(content, async (url) => ({
    type: "image_url",
    image_url: { url },
  })) as Promise<MultimodalContent[] | string>;
}

const IMAGE_CACHE_LIMIT = 50;
const imageCaches: Record<string, string> = {};
const imageCacheKeys: string[] = [];

function setImageCache(key: string, value: string) {
  if (!(key in imageCaches)) {
    if (imageCacheKeys.length >= IMAGE_CACHE_LIMIT) {
      const evict = imageCacheKeys.shift()!;
      delete imageCaches[evict];
    }
    imageCacheKeys.push(key);
  }
  imageCaches[key] = value;
}

export function cacheImageToBase64Image(imageUrl: string) {
  if (imageUrl.includes(CACHE_URL_PREFIX)) {
    if (!imageCaches[imageUrl]) {
      const reader = new FileReader();
      return fetch(imageUrl, {
        method: "GET",
        mode: "cors",
        credentials: "include",
      })
        .then((res) => res.blob())
        .then(async (blob) => {
          const base64 = await compressImage(blob, IMAGE_CACHE_MAX_SIZE);
          setImageCache(imageUrl, base64);
          return base64;
        }); // compressImage
    }
    return Promise.resolve(imageCaches[imageUrl]);
  }
  return Promise.resolve(imageUrl);
}

/** Max byte size used when compressing images for the ServiceWorker cache. */
export const IMAGE_CACHE_MAX_SIZE = 256 * 1024;

export function base64Image2Blob(base64Data: string, contentType: string) {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: contentType });
}

/**
 * Async, non-blocking version of base64Image2Blob.
 * Uses the browser's native fetch to decode base64 off the main thread,
 * avoiding UI jank for large images (gpt-image-2 4K output can be 10MB+).
 * Falls back to the synchronous version if fetch-based decoding fails.
 */
export async function base64Image2BlobAsync(
  base64Data: string,
  contentType: string,
): Promise<Blob> {
  try {
    const dataUri = `data:${contentType};base64,${base64Data}`;
    const res = await fetch(dataUri);
    return await res.blob();
  } catch {
    // Fallback: some environments may not support fetch with data URIs
    return base64Image2Blob(base64Data, contentType);
  }
}

export function uploadImage(file: Blob): Promise<string> {
  if (!window._SW_ENABLED) {
    // if serviceWorker register error, using compressImage
    return compressImage(file, IMAGE_CACHE_MAX_SIZE);
  }
  const body = new FormData();
  body.append("file", file);
  return fetch(UPLOAD_URL, {
    method: "post",
    body,
    mode: "cors",
    credentials: "include",
  })
    .then((res) => res.json())
    .then((res) => {
      // logger.info("res", res);
      if (res?.code == 0 && res?.data) {
        return res?.data;
      }
      throw Error(`upload Error: ${res?.msg}`);
    });
}

/**
 * Convert a raw base64 string to a Blob and upload it to the ServiceWorker
 * cache in one step.  Eliminates the repeated
 * `uploadImage(await base64Image2BlobAsync(b64, mime))` pattern found in
 * openai.ts and sd.ts.
 */
export async function cacheBase64Image(
  base64Data: string,
  contentType: string = "image/png",
): Promise<string> {
  const blob = await base64Image2BlobAsync(base64Data, contentType);
  return uploadImage(blob);
}

export function removeImage(imageUrl: string) {
  return fetch(imageUrl, {
    method: "DELETE",
    mode: "cors",
    credentials: "include",
  });
}
