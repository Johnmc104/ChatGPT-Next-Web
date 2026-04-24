import { showToast } from "./toast";
import Locale from "../locales";
import { fetch as tauriStreamFetch } from "./stream";

export function fetch(
  url: string,
  options?: Record<string, unknown>,
): Promise<any> {
  if (window.__TAURI__) {
    return tauriStreamFetch(url, options);
  }
  return window.fetch(url, options);
}

export function adapter(config: Record<string, unknown>) {
  const { baseURL, url, params, data: body, ...rest } = config;
  const path = baseURL ? `${baseURL}${url}` : url;
  const fetchUrl = params
    ? `${path}?${new URLSearchParams(
        params as Record<string, string>,
      ).toString()}`
    : path;
  return fetch(fetchUrl as string, { ...rest, body }).then((res) => {
    const { status, headers, statusText } = res;
    return res
      .text()
      .then((data: string) => ({ status, statusText, headers, data }));
  });
}

export function safeLocalStorage(): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  clear: () => void;
} {
  let storage: Storage | null;

  try {
    if (typeof window !== "undefined" && window.localStorage) {
      storage = window.localStorage;
    } else {
      storage = null;
    }
  } catch (e) {
    console.error("localStorage is not available:", e);
    storage = null;
  }

  return {
    getItem(key: string): string | null {
      if (storage) {
        return storage.getItem(key);
      } else {
        console.warn(
          `Attempted to get item "${key}" from localStorage, but localStorage is not available.`,
        );
        return null;
      }
    },
    setItem(key: string, value: string): void {
      if (storage) {
        storage.setItem(key, value);
      } else {
        console.warn(
          `Attempted to set item "${key}" in localStorage, but localStorage is not available.`,
        );
      }
    },
    removeItem(key: string): void {
      if (storage) {
        storage.removeItem(key);
      } else {
        console.warn(
          `Attempted to remove item "${key}" from localStorage, but localStorage is not available.`,
        );
      }
    },
    clear(): void {
      if (storage) {
        storage.clear();
      } else {
        console.warn(
          "Attempted to clear localStorage, but localStorage is not available.",
        );
      }
    },
  };
}

export function getOperationId(operation: {
  operationId?: string;
  method: string;
  path: string;
}) {
  // pattern '^[a-zA-Z0-9_-]+$'
  return (
    operation?.operationId ||
    `${operation.method.toUpperCase()}${operation.path.replaceAll("/", "_")}`
  );
}

export function clientUpdate() {
  // this a wild for updating client app
  return window.__TAURI__?.updater
    .checkUpdate()
    .then((updateResult) => {
      if (updateResult.shouldUpdate) {
        window.__TAURI__?.updater
          .installUpdate()
          .then((result) => {
            showToast(Locale.Settings.Update.Success);
          })
          .catch((e) => {
            console.error("[Install Update Error]", e);
            showToast(Locale.Settings.Update.Failed);
          });
      }
    })
    .catch((e) => {
      console.error("[Check Update Error]", e);
      showToast(Locale.Settings.Update.Failed);
    });
}
