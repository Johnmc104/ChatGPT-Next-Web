import { StoreKey } from "../app/constant";
import { shouldSkipStreamingChatWrite } from "../app/utils/indexedDB-storage";

test("skips intermediate streaming chat snapshots only", () => {
  expect(
    shouldSkipStreamingChatWrite(
      StoreKey.Chat,
      '{"state":{"messages":[{"streaming":true}]}}',
    ),
  ).toBe(true);
  expect(
    shouldSkipStreamingChatWrite(
      StoreKey.Chat,
      '{"state":{"messages":[{"streaming":false}]}}',
    ),
  ).toBe(false);
  expect(
    shouldSkipStreamingChatWrite(
      StoreKey.Config,
      '{"state":{"streaming":true}}',
    ),
  ).toBe(false);
});
