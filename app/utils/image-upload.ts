/**
 * Unified image-upload utilities (F-12).
 *
 * Re-exports all image-related helpers from utils/chat.ts so that
 * consumers can import from a single, semantically clear module.
 */
export {
  IMAGE_CACHE_MAX_SIZE,
  compressImage,
  uploadImage,
  removeImage,
  cacheBase64Image,
  cacheImageToBase64Image,
  base64Image2Blob,
  base64Image2BlobAsync,
} from "./chat";
