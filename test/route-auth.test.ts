/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/app/api/auth", () => ({ auth: jest.fn() }));
jest.mock("@/app/config/server", () => ({
  getServerSideConfig: () => ({
    cloudflareAccountId: "acct",
    cloudflareKVNamespaceId: "ns",
    cloudflareKVApiKey: "kv-key",
  }),
}));
jest.mock("@/app/api/model-info/cache", () => ({
  refreshModelInfo: jest.fn(async () => 3),
  getModelInfoCache: () => ({ updated_at: 1 }),
}));

import { auth } from "@/app/api/auth";
import { POST as saveArtifact } from "@/app/api/artifacts/route";
import { POST as refreshModelInfo } from "@/app/api/model-info/refresh/route";

const authMock = auth as jest.Mock;
const upstreamFetch = jest.fn();

beforeEach(() => {
  authMock.mockReset();
  upstreamFetch.mockReset();
  global.fetch = upstreamFetch as unknown as typeof fetch;
});

test("artifact upload requires authorization", async () => {
  authMock.mockResolvedValue({ error: true, code: "missing-code" });
  const res = await saveArtifact(
    new NextRequest("https://site.test/api/artifacts", {
      method: "POST",
      body: "<html>phish</html>",
    }),
    { params: Promise.resolve({}) },
  );
  expect(res.status).toBe(401);
  expect(upstreamFetch).not.toHaveBeenCalled();
});

test("authorized artifact upload is stored", async () => {
  authMock.mockResolvedValue({ error: false, systemApiKey: "k" });
  upstreamFetch.mockResolvedValue(
    new Response(JSON.stringify({ success: true }), { status: 200 }),
  );
  const res = await saveArtifact(
    new NextRequest("https://site.test/api/artifacts", {
      method: "POST",
      body: "<html>ok</html>",
    }),
    { params: Promise.resolve({}) },
  );
  expect(res.status).toBe(200);
  expect(upstreamFetch).toHaveBeenCalledTimes(1);
});

test("model-info refresh requires authorization", async () => {
  authMock.mockResolvedValue({ error: true, code: "missing-code" });
  const res = await refreshModelInfo(
    new NextRequest("https://site.test/api/model-info/refresh", {
      method: "POST",
    }),
  );
  expect(res.status).toBe(401);
});
