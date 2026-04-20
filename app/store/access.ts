import {
  ServiceProvider,
  StoreKey,
  ApiPath,
  OPENAI_BASE_URL,
  RAGFLOW_BASE_URL,
} from "../constant";
import { getHeaders } from "../client/api";
import { getClientConfig } from "../config/client";
import { createPersistStore } from "../utils/store";
import { ensure } from "../utils/clone";
import { DEFAULT_CONFIG } from "./config";
import { getModelProvider } from "../utils/model";

let fetchState = 0; // 0 not fetch, 1 fetching, 2 done

const isApp = getClientConfig()?.buildMode === "export";

const DEFAULT_OPENAI_URL = isApp ? OPENAI_BASE_URL : ApiPath.OpenAI;
const DEFAULT_RAGFLOW_URL = isApp ? RAGFLOW_BASE_URL : ApiPath.RAGFlow;

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
      return ensure(get(), ["openaiApiKey"]);
    },

    isAuthorized() {
      this.fetch();

      const state = get();

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
        return true;
      }

      return false;
    },
    fetch() {
      if (fetchState > 0 || getClientConfig()?.buildMode === "export") return;
      fetchState = 1;
      fetch("/api/config", {
        method: "post",
        body: null,
        headers: {
          ...getHeaders(),
        },
      })
        .then((res) => res.json())
        .then((res) => {
          const defaultModel = res.defaultModel ?? "";
          if (defaultModel !== "") {
            const [model, providerName] = getModelProvider(defaultModel);
            DEFAULT_CONFIG.modelConfig.model = model;
            DEFAULT_CONFIG.modelConfig.providerName = providerName as any;
          }

          return res;
        })
        .then((res: DangerConfig) => {
          console.log("[Config] got config from server", res);
          set(() => ({ ...res }));
        })
        .catch(() => {
          console.error("[Config] failed to fetch config");
        })
        .finally(() => {
          fetchState = 2;
        });
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
