import { getHeaders } from "../app/client/api";
import { useAccessStore } from "../app/store";
import { ACCESS_CODE_PREFIX } from "../app/constant";

jest.mock("../app/store", () => ({
  useAccessStore: { getState: jest.fn() },
  useChatStore: {
    getState: () => ({
      currentSession: () => ({
        mask: { modelConfig: { providerName: "OpenAI" } },
      }),
    }),
  },
}));
jest.mock("../app/client/platforms/openai", () => ({ ChatGPTApi: jest.fn() }));
jest.mock("../app/client/platforms/ragflow", () => ({ RAGFlowApi: jest.fn() }));

test("an allowed user key has the same priority in requests and site verification", () => {
  (useAccessStore.getState as jest.Mock).mockReturnValue({
    openaiApiKey: " sample ",
    accessCode: "old-code",
    hideUserApiKey: false,
  });
  expect(getHeaders()).toMatchObject({
    Authorization: "Bearer sample",
    "X-User-Api-Key": "sample",
  });
});

test("hidden persisted keys are not sent and site access codes are trimmed", () => {
  (useAccessStore.getState as jest.Mock).mockReturnValue({
    openaiApiKey: "hidden",
    accessCode: " demo ",
    hideUserApiKey: true,
  });
  const headers = getHeaders();
  expect(headers.Authorization).toBe(`Bearer ${ACCESS_CODE_PREFIX}demo`);
  expect(headers).not.toHaveProperty("X-User-Api-Key");
});
