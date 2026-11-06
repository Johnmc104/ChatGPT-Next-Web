import { StateStorage } from "zustand/middleware";
import { get, set, del, clear } from "idb-keyval";
import { safeLocalStorage } from "./platform";
import { StoreKey } from "../constant";

const localStorage = safeLocalStorage();

const WRITE_DEBOUNCE_MS = 300;

export function shouldSkipStreamingChatWrite(name: string, value: string) {
  return name === StoreKey.Chat && value.includes('"streaming":true');
}

class IndexedDBStorage implements StateStorage {
  private pendingWrites = new Map<
    string,
    { timer: ReturnType<typeof setTimeout>; value: string }
  >();

  private get canUseIndexedDB() {
    return typeof indexedDB !== "undefined";
  }

  public async getItem(name: string): Promise<string | null> {
    try {
      if (!this.canUseIndexedDB) return localStorage.getItem(name);
      // If there's a pending write, return that value for consistency
      const pending = this.pendingWrites.get(name);
      if (pending) return pending.value;
      const value = (await get(name)) || localStorage.getItem(name);
      return value;
    } catch (error) {
      return localStorage.getItem(name);
    }
  }

  public async setItem(name: string, value: string): Promise<void> {
    try {
      if (shouldSkipStreamingChatWrite(name, value)) return;
      if (value.includes('"_hasHydrated":false')) {
        console.warn("skip setItem", name);
        return;
      }
      // Debounce writes per key
      const existing = this.pendingWrites.get(name);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        this.pendingWrites.delete(name);
        if (this.canUseIndexedDB) {
          set(name, value).catch(() => localStorage.setItem(name, value));
        } else {
          localStorage.setItem(name, value);
        }
      }, WRITE_DEBOUNCE_MS);
      this.pendingWrites.set(name, { timer, value });
    } catch (error) {
      localStorage.setItem(name, value);
    }
  }

  public async removeItem(name: string): Promise<void> {
    try {
      if (!this.canUseIndexedDB) {
        localStorage.removeItem(name);
        return;
      }
      await del(name);
    } catch (error) {
      localStorage.removeItem(name);
    }
  }

  public async clear(): Promise<void> {
    try {
      if (!this.canUseIndexedDB) {
        localStorage.clear();
        return;
      }
      await clear();
    } catch (error) {
      localStorage.clear();
    }
  }

  /**
   * Immediately flush all pending debounced writes to IndexedDB.
   * Falls back to localStorage on error.
   */
  public flushPending(): void {
    for (const [name, { timer, value }] of this.pendingWrites) {
      clearTimeout(timer);
      if (this.canUseIndexedDB) {
        set(name, value).catch(() => localStorage.setItem(name, value));
      } else {
        localStorage.setItem(name, value);
      }
    }
    this.pendingWrites.clear();
  }
}

export const indexedDBStorage = new IndexedDBStorage();

// Flush pending writes before tab/window closes to prevent data loss
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    indexedDBStorage.flushPending();
  });
}
