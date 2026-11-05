import {
  compressImage,
  releaseImageResource,
  preProcessImageContentBase,
} from "../app/services/media/image";
import heic2any from "heic2any";
jest.mock("heic2any", () => jest.fn());

test("only local cached resources are deleted", async () => {
  (fetch as jest.Mock).mockClear();
  await releaseImageResource("https://external.test/api/cache/image.png");
  expect(fetch).not.toHaveBeenCalled();
  await releaseImageResource("/api/cache/image.png");
  expect(fetch).toHaveBeenCalledWith(`${location.origin}/api/cache/image.png`, {
    method: "DELETE",
  });
});

test.each(["image/heic", "image/heif"])(
  "%s conversion never reads the original file concurrently",
  async (type) => {
    const converted = new Blob(["jpeg"], { type: "image/jpeg" });
    (heic2any as jest.Mock).mockResolvedValue(converted);
    const reader = {
      readAsDataURL: jest.fn(),
      onload: null,
      onerror: null as null | (() => void),
    };
    const constructor = jest
      .spyOn(globalThis, "FileReader")
      .mockImplementation(() => reader as unknown as FileReader);
    const pending = compressImage(new Blob(["heic"], { type }), 1024);
    await Promise.resolve();
    expect(reader.readAsDataURL).toHaveBeenCalledTimes(1);
    expect(reader.readAsDataURL).toHaveBeenCalledWith(converted);
    reader.onerror?.();
    await expect(pending).rejects.toBeUndefined();
    constructor.mockRestore();
  },
);

test("image preprocessing converts provider parts and reports invalid content", async () => {
  const transform = jest.fn(async (url: string) => ({
    type: "image_url" as const,
    image_url: { url },
  }));
  const input = [{ inlineData: { mimeType: "image/png", data: "AAAA" } }];
  expect(await preProcessImageContentBase(input as any, transform)).toEqual([
    { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
  ]);
  await expect(
    preProcessImageContentBase(
      [{ type: "image_url", image_url: { url: "" } }],
      transform,
    ),
  ).rejects.toThrow("Unsupported image content");
});
