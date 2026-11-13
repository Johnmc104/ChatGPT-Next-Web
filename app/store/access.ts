import {
  ServiceProvider,
  StoreKey,
  ApiPath,
} from "../constant";
import { getHeaders } from "../client/api";
import { createPersistStore } from "../utils/store";
import { ensure } from "../utils/clone";
import { DEFAULT_CONFIG } from "./config";
import { DEFAULT_MODELS } from "../domain/model/catalog";
import { resolveConfiguredModel } from "../utils/model";
import { fetchJSON } from "../utils/fetch";
import { logger } from "@/app/utils/logger";

import {
  checkAuthorization,
  type AuthorizationError,
} from "../services/auth/check";

let verifiedCredentials: string | undefined;
let verification:
  | { credentials: string; promise: Promise<boolean> }
  | undefined;
const credentials = (code: string, key: string) =>
  JSON.stringify([code.trim(), key.trim()]);

let fetchPromise: Promise<void> | null = null;
let configLoaded = false;


const DEFAULT_OPENAI_URL: string = ApiPath.OpenAI;
const DEFAULT_RAGFLOW_URL: string = ApiPath.RAGFlow;

const DEFAULT_ACCESS_STATE = {
  accessCode: "",
  useCustomConfig: false,

  provider: ServiceProvider.OpenAI,

  // --- Active fields ---
  // OpenAI-compatible endpoint (user custom endpoint or default proxy)
  openaiUrl: DEFAULT_OPENAI_URL,
  openaiApiKey: "",

  // Azure
  azureUrl: "",
  azureApiKey: "",
  azureApiVersion: "2023-08-01-preview",

  // Stability (for SD image generation)
  stabilityUrl: "",
  stabilityApiKey: "",

  // RAGFlow (knowledge base proxy)
  ragflowUrl: DEFAULT_RAGFLOW_URL,
  ragflowApiKey: "",

  // server config
  needCode: true,
  hideUserApiKey: false,
  hideBalanceQuery: false,
  disableGPT4: false,
  disableFastLink: false,
  customModels: "",
  defaultModel: "",
  visionModels: "",
  hasServerApiKey: false,
  hasCustomBaseUrl: false,
  configStatus: "idle" as "idle" | "loading" | "ready" | "error",
  configError: "",
  authorizationStatus: "idle" as "idle" | "checking" | "authorized" | "error",
  authorizationError: "" as AuthorizationError | "",

  // tts config
  edgeTTSVoiceName: "zh-CN-YunxiNeural",
};

export const useAccessStore = createPersistStore(
  { ...DEFAULT_ACCESS_STATE },

  (set, get) => ({
    enabledAccessControl() {
      this.fetch();

      return get().needCode;
    },
    getVisionModels() {
      this.fetch();
      return get().visionModels;
    },
    edgeVoiceName() {
      this.fetch();

      return get().edgeTTSVoiceName;
    },

    // -----------------------------------------------------------------------
    // Authorization check — simplified for unified proxy architecture.
    // Only openaiApiKey matters client-side (for user custom endpoints).
    // RAGFlow and per-provider keys are server-managed via env vars.
    // -----------------------------------------------------------------------

    isValidOpenAI() {
      return !get().hideUserApiKey && !!get().openaiApiKey.trim();
    },

    isAuthorized() {
      this.fetch();

      const state = get();

      // Do not treat the initial defaults as a real authorization result.
      if (!configLoaded || state.configStatus !== "ready") return false;

      // User has their own API key for custom endpoint
      if (this.isValidOpenAI()) {
        return true;
      }

      // No access control required and server has API key configured
      if (!this.enabledAccessControl() && state.hasServerApiKey) {
        return true;
      }

      // Access control enabled: need valid access code and server API key
      if (
        this.enabledAccessControl() &&
        ensure(get(), ["accessCode"]) &&
        state.hasServerApiKey
      ) {
        return (
          verifiedCredentials ===
          credentials(
            state.accessCode,
            state.hideUserApiKey ? "" : state.openaiApiKey,
          )
        );
      }

      return false;
    },
    async verifyAuthorization(): Promise<boolean> {
      await this.fetchConfig();
      const state = get();
      const key = state.hideUserApiKey ? "" : state.openaiApiKey;
      const signature = credentials(state.accessCode, key);
      if (verifiedCredentials === signature) return true;
      if (verification?.credentials === signature) return verification.promise;
      set({ authorizationStatus: "checking", authorizationError: "" });
      const promise = checkAuthorization(state.accessCode, key)
        .then((result) => {
          const current = get();
          if (
            signature !==
            credentials(
              current.accessCode,
              current.hideUserApiKey ? "" : current.openaiApiKey,
            )
          ) {
            if (verification?.credentials === signature)
              set({ authorizationStatus: "idle", authorizationError: "" });
            return false;
          }
          verifiedCredentials = result.ok ? signature : undefined;
          set({
            authorizationStatus: result.ok ? "authorized" : "error",
            authorizationError: result.ok ? "" : result.code,
          });
          return result.ok;
        })
        .finally(() => {
          if (verification?.credentials === signature) verification = undefined;
        });
      verification = { credentials: signature, promise };
      return promise;
    },
    fetchConfig(): Promise<void> {
      if (configLoaded) return Promise.resolve();
      if (fetchPromise) return fetchPromise;

      set({ configStatus: "loading", configError: "" });
      fetchPromise = fetchJSON<DangerConfig>("/api/config", {
        method: "post",
        body: null,
        headers: {
          ...getHeaders(),
        },
      })
        .then((res) => {
          const defaultModel = res.defaultModel ?? "";
          if (defaultModel !== "") {
            const selection = resolveConfiguredModel(
              defaultModel,
              DEFAULT_MODELS,
              "",
              res.customModels ?? "",
            );
            DEFAULT_CONFIG.modelConfig.model =
              selection.model as typeof DEFAULT_CONFIG.modelConfig.model;
            DEFAULT_CONFIG.modelConfig.providerName = (selection.providerName ??
              ServiceProvider.OpenAI) as typeof DEFAULT_CONFIG.modelConfig.providerName;
          }
          logger.info("[Config] got config from server", res);
          configLoaded = true;
          set(() => ({
            ...res,
            configStatus: "ready",
            configError: "",
          }));
          if (
            get().needCode &&
            get().accessCode.trim() &&
            !this.isValidOpenAI()
          ) {
            void this.verifyAuthorization().catch(() => undefined);
          }
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "failed to fetch config";
          logger.error("[Config] failed to fetch config", error);
          configLoaded = false;
          set({ configStatus: "error", configError: message });
          throw error;
        })
        .finally(() => {
          fetchPromise = null;
        });
      return fetchPromise;
    },
    fetch() {
      void this.fetchConfig().catch(() => undefined);
    },
  }),
  {
    name: StoreKey.Access,
    version: 3,
    migrate(persistedState, version) {
      if (version < 2) {
        const state = persistedState as {
          token: string;
          openaiApiKey: string;
          azureApiVersion: string;
        };
        state.openaiApiKey = state.token;
        state.azureApiVersion = "2023-08-01-preview";
      }

      // v3: legacy provider fields are dropped automatically by ensure()
      // when they no longer exist in DEFAULT_ACCESS_STATE.

      return persistedState as any;
    },
  },
);
