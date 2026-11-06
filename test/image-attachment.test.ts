import {
  createImageAttachment,
  imageAttachmentIdsForSubmission,
  imageAttachmentReducer,
  imageAttachmentUrls,
} from "../app/domain/media/image-attachment";

const file = new File(["png"], "photo.png", { type: "image/png" });
const attachment = createImageAttachment(file, "image-1");

test("creates a queued draft attachment with file metadata", () => {
  expect(attachment).toMatchObject({
    id: "image-1",
    fileName: "photo.png",
    mimeType: "image/png",
    status: "queued",
    owner: "draft",
  });
});

test("tracks upload success and exposes only sendable URLs", () => {
  let state = imageAttachmentReducer([], { type: "enqueue", attachment });
  state = imageAttachmentReducer(state, {
    type: "uploading",
    ids: ["image-1"],
  });
  state = imageAttachmentReducer(state, {
    type: "ready",
    id: "image-1",
    url: "https://cache/image-1",
  });
  expect(imageAttachmentUrls(state)).toEqual(["https://cache/image-1"]);
  expect(imageAttachmentIdsForSubmission(state)).toEqual(["image-1"]);
});

test("failed attachments retain the file and error for retry", () => {
  let state = imageAttachmentReducer([], { type: "enqueue", attachment });
  state = imageAttachmentReducer(state, {
    type: "failed",
    id: "image-1",
    error: "network",
  });
  expect(state[0]).toMatchObject({ status: "failed", error: "network" });
  expect(state[0].file).toBe(file);
  expect(imageAttachmentUrls(state)).toEqual([]);
});

test("sending and sent states remain in the payload and transfer ownership", () => {
  let state = imageAttachmentReducer(
    [{ ...attachment, status: "ready", url: "https://cache/image-1" }],
    { type: "sending", ids: ["image-1"] },
  );
  expect(imageAttachmentUrls(state)).toEqual(["https://cache/image-1"]);
  state = imageAttachmentReducer(state, { type: "sent", ids: ["image-1"] });
  expect(state[0]).toMatchObject({ status: "sent", owner: "message" });
});

test("remove and clear can preserve attachments owned by sent messages", () => {
  const sent = { ...attachment, id: "sent", status: "sent" as const };
  const draft = { ...attachment, id: "draft" };
  let state = [sent, draft];
  state = imageAttachmentReducer(state, { type: "clear", keepIds: ["sent"] });
  expect(state.map((item) => item.id)).toEqual(["sent"]);
  state = imageAttachmentReducer(state, { type: "remove", id: "sent" });
  expect(state).toEqual([]);
});
