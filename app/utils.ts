/**
 * Barrel re-export file.
 *
 * All implementations live in app/utils/ sub-modules.
 * This file exists solely to preserve the `from "../utils"` import paths
 * used by 26+ consumer files across the codebase.
 */

// Model detection
export {
  isDalle3,
  isGptImageModel,
  isCogViewModel,
  isGpt5Model,
  isImageModel,
  isVisionModel,
  isReasoningModel,
  getTimeoutMSByModel,
  getModelSizes,
  supportsCustomSize,
  showPlugins,
} from "./utils/model-detection";

// Message helpers
export {
  getMessageTextContent,
  getMessageTextContentWithoutThinking,
  getMessageImages,
} from "./utils/message";

// Responsive / UI hooks
export {
  useWindowSize,
  useMobileScreen,
  MOBILE_MAX_WIDTH,
} from "./utils/responsive";

// File I/O & clipboard
export {
  copyToClipboard,
  downloadAs,
  readFromFile,
  selectOrCopy,
} from "./utils/file-io";

// DOM utilities
export { autoGrowTextArea, getCSSVar, isIOS } from "./utils/dom";

// Platform / Tauri utilities
export {
  fetch,
  adapter,
  safeLocalStorage,
  getOperationId,
  clientUpdate,
} from "./utils/platform";

// Misc
export function trimTopic(topic: string) {
  return topic
    .replace(/^["""*]+|["""*]+$/g, "")
    .replace(/[，。！？"""、,.!?*]*$/, "");
}

// https://gist.github.com/iwill/a83038623ba4fef6abb9efca87ae9ccb
export function semverCompare(a: string, b: string) {
  if (a.startsWith(b + "-")) return -1;
  if (b.startsWith(a + "-")) return 1;
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "case",
    caseFirst: "upper",
  });
}
