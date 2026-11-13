import {
  INTERRUPTED_REPLY_MESSAGE,
  repairChatSessions,
  settleStaleMessage,
} from "../app/store/chat-repair";
import Locale from "../app/locales";

const msg = (over: Record<string, unknown>) =>
  ({ id: "m", date: "", role: "assistant", content: "", ...over }) as any;

describe("settleStaleMessage", () => {
  test("leaves a reply whose request is still running untouched", () => {
    const m = msg({ streaming: true });
    expect(settleStaleMessage(m, true)).toBe(false);
    expect(m).toMatchObject({ streaming: true, content: "" });
  });

  test("turns an empty stale reply into a visible error", () => {
    const m = msg({ streaming: true });
    expect(settleStaleMessage(m, false)).toBe(true);
    expect(m.streaming).toBe(false);
    expect(m.isError).toBe(true);
    expect(m.content).toContain(INTERRUPTED_REPLY_MESSAGE);
  });

  test("keeps the partial text of a stale reply", () => {
    const m = msg({ streaming: true, content: "partial" });
    settleStaleMessage(m, false);
    expect(m).toMatchObject({ streaming: false, content: "partial" });
    expect(m.isError).toBeUndefined();
  });

  test("ignores finished messages and user messages", () => {
    expect(settleStaleMessage(msg({ content: "done" }), false)).toBe(false);
    expect(settleStaleMessage(msg({ role: "user", content: "" }), false)).toBe(
      false,
    );
  });

  test("keeps image-only replies", () => {
    const m = msg({
      content: [{ type: "image_url", image_url: { url: "u" } }],
    });
    expect(settleStaleMessage(m, false)).toBe(false);
  });
});

describe("repairChatSessions", () => {
  test("clears stale streaming flags and leaked titles", () => {
    const sessions = [
      {
        id: "s1",
        topic: '{"id":"chatcmpl-1","object":"chat.completion"}',
        messages: [
          msg({ role: "user", content: "hi" }),
          msg({ streaming: true, content: "half" }),
        ],
      },
      { id: "s2", topic: "旅行计划", messages: [msg({ content: "ok" })] },
    ] as any;

    expect(repairChatSessions(sessions)).toBe(true);
    expect(sessions[0].topic).toBe(Locale.Store.DefaultTopic);
    expect(sessions[0].messages[1].streaming).toBe(false);
    expect(sessions[1].topic).toBe("旅行计划");
    expect(JSON.stringify(sessions)).not.toContain('"streaming":true');
  });

  test("reports no change for healthy sessions", () => {
    const sessions = [
      { id: "s", topic: "Title", messages: [msg({ content: "ok" })] },
    ] as any;
    expect(repairChatSessions(sessions)).toBe(false);
  });
});
