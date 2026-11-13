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
  getMessageImages,
} from "./utils/message";

// Responsive / UI hooks
export {
  useMobileScreen,
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

// Platform utilities
export { safeLocalStorage, getOperationId } from "./utils/platform";
