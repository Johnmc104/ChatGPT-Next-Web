/**
 * Lightweight toast proxy — decouples store / util layers from the React
 * component that actually renders the toast.
 *
 * Usage in stores / utils:
 *   import { showToast } from "@/app/utils/toast";
 *
 * The real renderer is registered once by the UI layer at app startup via
 * `registerToastHandler()`.
 */

export type ToastAction = { text: string; onClick: () => void };
type ToastFn = (content: string, action?: ToastAction, delay?: number) => void;

let _handler: ToastFn = (content) => {
  // Fallback before the UI layer has registered the real handler.
  console.warn("[Toast]", content);
};

export function registerToastHandler(fn: ToastFn) {
  _handler = fn;
}

export function showToast(
  content: string,
  action?: ToastAction,
  delay?: number,
) {
  _handler(content, action, delay);
}
