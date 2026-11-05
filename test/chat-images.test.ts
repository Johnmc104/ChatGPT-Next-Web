import { act, renderHook } from "@testing-library/react";
import { useChatImages } from "../app/components/chat-images";
import { uploadImage, releaseImageResource } from "../app/services/media/image";
import { isVisionModel } from "../app/utils/model-detection";
import { modelCapabilityKey } from "../app/domain/model/overrides";

let session = {
  id: "one",
  mask: { modelConfig: { model: "vision", providerName: "OpenAI" } },
};
const overrides = {
  [modelCapabilityKey("vision", "OpenAI")]: {
    imageInput: true,
    maxInputImages: 5,
  },
};
jest.mock("../app/store", () => ({
  useChatStore: () => ({ currentSession: () => session }),
  useAppConfig: (selector: any) =>
    selector({ modelCapabilityOverrides: overrides }),
}));
jest.mock("../app/hooks/useModelInfo", () => ({
  useModelInfo: () => ({ getModelInfo: () => undefined }),
}));
jest.mock("../app/utils/model-detection", () => ({
  isVisionModel: jest.fn(() => true),
}));
jest.mock("../app/services/media/image", () => ({
  uploadImage: jest.fn(),
  releaseImageResource: jest.fn(async () => undefined),
}));
const files = (count: number) =>
  Array.from(
    { length: count },
    (_, i) => new File(["png"], `${i}.png`, { type: "image/png" }),
  );
beforeEach(() => {
  jest.clearAllMocks();
  session = {
    id: "one",
    mask: { modelConfig: { model: "vision", providerName: "OpenAI" } },
  };
  (isVisionModel as jest.Mock).mockReturnValue(true);
});

test("successive selections can exceed three but never exceed the configured limit", async () => {
  let id = 0;
  (uploadImage as jest.Mock).mockImplementation(
    async () => `https://cache/${++id}`,
  );
  const hook = renderHook(useChatImages);
  await act(async () => hook.result.current.appendImageFiles(files(3)));
  await act(async () => hook.result.current.appendImageFiles(files(3)));
  expect(hook.result.current.attachImages).toHaveLength(5);
  expect(uploadImage).toHaveBeenCalledTimes(5);
  expect(hook.result.current.imageError).not.toBe("");
});

test("parallel selections reserve remaining slots before uploads finish", async () => {
  const resolvers: ((url: string) => void)[] = [];
  (uploadImage as jest.Mock).mockImplementation(
    () => new Promise((resolve) => resolvers.push(resolve)),
  );
  const hook = renderHook(useChatImages);
  let first!: Promise<void>, second!: Promise<void>;
  act(() => {
    first = hook.result.current.appendImageFiles(files(3));
    second = hook.result.current.appendImageFiles(files(3));
  });
  expect(uploadImage).toHaveBeenCalledTimes(5);
  await act(async () => {
    resolvers.forEach((resolve, i) => resolve(`https://cache/${i}`));
    await Promise.all([first, second]);
  });
  expect(hook.result.current.attachImages).toHaveLength(5);
  expect(hook.result.current.uploading).toBe(false);
});

test("partial failure preserves successes and offers retry", async () => {
  (uploadImage as jest.Mock)
    .mockResolvedValueOnce("https://cache/ok")
    .mockRejectedValueOnce(new Error("failed"))
    .mockResolvedValueOnce("https://cache/retry");
  const hook = renderHook(useChatImages);
  await act(async () => hook.result.current.appendImageFiles(files(2)));
  expect(hook.result.current.attachImages).toEqual(["https://cache/ok"]);
  expect(hook.result.current.canRetryImages).toBe(true);
  await act(async () => hook.result.current.retryImages());
  expect(hook.result.current.attachImages).toHaveLength(2);
});

test("uploads finishing after a session switch are released instead of attached", async () => {
  let resolve!: (url: string) => void;
  (uploadImage as jest.Mock).mockImplementation(
    () => new Promise((done) => (resolve = done)),
  );
  const hook = renderHook(useChatImages);
  let pending!: Promise<void>;
  act(() => {
    pending = hook.result.current.appendImageFiles(files(1));
  });
  session = { ...session, id: "two" };
  hook.rerender();
  await act(async () => {
    resolve("https://cache/old");
    await pending;
  });
  expect(hook.result.current.attachImages).toEqual([]);
  expect(releaseImageResource).toHaveBeenCalledWith("https://cache/old");
});

test("switching to text-only keeps images until the user explicitly removes them", async () => {
  (uploadImage as jest.Mock).mockResolvedValue("https://cache/keep");
  const hook = renderHook(useChatImages);
  await act(async () => hook.result.current.appendImageFiles(files(1)));
  session = {
    ...session,
    mask: { modelConfig: { model: "text-only", providerName: "OpenAI" } },
  };
  (isVisionModel as jest.Mock).mockReturnValue(false);
  hook.rerender();
  expect(hook.result.current.attachImages).toHaveLength(1);
  expect(hook.result.current.maxAttachImages).toBe(0);
  act(() => hook.result.current.clearImages());
  expect(hook.result.current.attachImages).toEqual([]);
});

test("images transferred to a message survive component unmount", async () => {
  (uploadImage as jest.Mock).mockResolvedValue("https://cache/history");
  const hook = renderHook(useChatImages);
  await act(async () => hook.result.current.appendImageFiles(files(1)));
  const finish = hook.result.current.beginImageSubmission();
  hook.unmount();
  expect(releaseImageResource).not.toHaveBeenCalled();
  finish(true);
  expect(releaseImageResource).not.toHaveBeenCalled();
});
