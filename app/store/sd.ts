import {
  StabilityConfig,
  StoreKey,
  ACCESS_CODE_PREFIX,
  ApiPath,
} from "@/app/constant";
import { getBearerToken } from "@/app/client/api";
import { createPersistStore } from "@/app/utils/store";
import { nanoid } from "nanoid";
import { cacheBase64Image } from "@/app/utils/chat";
import {
  models,
  getModelParamBasicData,
  SdFormData,
  SdModelConfig,
} from "./sd-config";
import { useAccessStore } from "./access";

export interface SdDrawItem {
  id: string;
  status: "running" | "wait" | "success" | "error";
  model: string;
  model_name: string;
  params: SdFormData;
  created_at: string;
  img_data: string;
  error?: string;
}

type SdModelRef = Pick<SdModelConfig, "name" | "value">;

const defaultModel = {
  name: models[0].name,
  value: models[0].value,
};

const defaultParams = getModelParamBasicData(models[0].params({}), {});

const DEFAULT_SD_STATE = {
  currentId: 0,
  draw: [],
  currentModel: defaultModel,
  currentParams: defaultParams,
};

export const useSdStore = createPersistStore<
  {
    currentId: number;
    draw: SdDrawItem[];
    currentModel: SdModelRef;
    currentParams: SdFormData;
  },
  {
    getNextId: () => number;
    sendTask: (
      data: Omit<SdDrawItem, "id" | "status">,
      okCall?: () => void,
    ) => void;
    updateDraw: (draw: SdDrawItem) => void;
    setCurrentModel: (model: SdModelRef) => void;
    setCurrentParams: (data: SdFormData) => void;
  }
>(
  DEFAULT_SD_STATE,
  (set, _get) => {
    function get() {
      return {
        ..._get(),
        ...methods,
      };
    }

    const methods = {
      getNextId() {
        const id = ++_get().currentId;
        set({ currentId: id });
        return id;
      },
      sendTask(data: Omit<SdDrawItem, "id" | "status">, okCall?: () => void) {
        const item: SdDrawItem = {
          ...data,
          id: nanoid(),
          status: "running" as const,
        };
        set({ draw: [item, ..._get().draw] });
        this.getNextId();
        this.stabilityRequestCall(item);
        okCall?.();
      },
      stabilityRequestCall(data: SdDrawItem) {
        const accessStore = useAccessStore.getState();
        let prefix: string = ApiPath.Stability as string;
        let bearerToken = "";
        if (accessStore.useCustomConfig) {
          prefix = accessStore.stabilityUrl || (ApiPath.Stability as string);
          bearerToken = getBearerToken(accessStore.stabilityApiKey);
        }
        if (!bearerToken && accessStore.enabledAccessControl()) {
          bearerToken = getBearerToken(
            ACCESS_CODE_PREFIX + accessStore.accessCode,
          );
        }
        const headers = {
          Accept: "application/json",
          Authorization: bearerToken,
        };
        const path = `${prefix}/${StabilityConfig.GeneratePath}/${data.model}`;
        const formData = new FormData();
        for (let paramsKey in data.params) {
          formData.append(paramsKey, String(data.params[paramsKey]));
        }
        fetch(path, {
          method: "POST",
          headers,
          body: formData,
        })
          .then((response) => response.json())
          .then((resData) => {
            if (resData.errors && resData.errors.length > 0) {
              this.updateDraw({
                ...data,
                status: "error",
                error: resData.errors[0],
              });
              this.getNextId();
              return;
            }
            const self = this;
            if (resData.finish_reason === "SUCCESS") {
              cacheBase64Image(resData.image, "image/png")
                .then((img_data) => {
                  console.debug("uploadImage success", img_data, self);
                  self.updateDraw({
                    ...data,
                    status: "success",
                    img_data,
                  });
                })
                .catch((e) => {
                  console.error("uploadImage error", e);
                  self.updateDraw({
                    ...data,
                    status: "error",
                    error: JSON.stringify(e),
                  });
                });
            } else {
              self.updateDraw({
                ...data,
                status: "error",
                error: JSON.stringify(resData),
              });
            }
            this.getNextId();
          })
          .catch((error) => {
            this.updateDraw({ ...data, status: "error", error: error.message });
            console.error("Error:", error);
            this.getNextId();
          });
      },
      updateDraw(_draw: SdDrawItem) {
        const draw = _get().draw || [];
        draw.some((item, index) => {
          if (item.id === _draw.id) {
            draw[index] = _draw;
            set(() => ({ draw }));
            return true;
          }
        });
      },
      setCurrentModel(model: SdModelRef) {
        set({ currentModel: model });
      },
      setCurrentParams(data: SdFormData) {
        set({
          currentParams: data,
        });
      },
    };

    return methods;
  },
  {
    name: StoreKey.SdList,
    version: 1.0,
  },
);
