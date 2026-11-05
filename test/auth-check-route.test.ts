/** @jest-environment node */
import { NextRequest } from "next/server";
import { POST } from "../app/api/auth/check/route";
import { auth } from "../app/api/auth";

jest.mock("../app/api/auth", () => ({ auth: jest.fn() }));
const authMock = auth as jest.Mock;

test("authorization success never serializes a server key", async () => {
  authMock.mockResolvedValue({
    error: false,
    systemApiKey: "fixture-server-secret",
  });
  const response = await POST(
    new NextRequest("https://site.test/api/auth/check", { method: "POST" }),
  );
  expect(await response.json()).toEqual({ ok: true });
  expect(response.headers.get("Cache-Control")).toBe("no-store");
});

test.each([
  ["invalid-code", 401],
  ["missing-code", 401],
  ["user-key-disabled", 403],
  ["missing-server-key", 503],
])("returns a safe error code for %s", async (code, status) => {
  authMock.mockResolvedValue({
    error: true,
    code,
    msg: "internal information",
  });
  const response = await POST(
    new NextRequest("https://site.test/api/auth/check", { method: "POST" }),
  );
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ ok: false, code });
});
