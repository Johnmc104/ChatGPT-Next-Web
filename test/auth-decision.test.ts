import { resolveAuthorization } from "../app/domain/auth/authorization";

describe("resolveAuthorization", () => {
  const base = {
    hasUserKey: false,
    hasServerKey: true,
    needCode: true,
    hasAccessCode: false,
  };

  test("allows a user-provided key without an access code", () => {
    expect(
      resolveAuthorization({ ...base, hasUserKey: true }),
    ).toEqual({ status: "authorized" });
  });

  test("waits for the access code when server access control is enabled", () => {
    expect(resolveAuthorization(base)).toEqual({
      status: "missing-access-code",
    });
  });

  test("allows a valid server configuration without access control", () => {
    expect(
      resolveAuthorization({
        ...base,
        needCode: false,
        hasAccessCode: false,
      }),
    ).toEqual({ status: "authorized" });
  });

  test("reports a missing server key separately", () => {
    expect(
      resolveAuthorization({ ...base, hasAccessCode: true, hasServerKey: false }),
    ).toEqual({ status: "missing-server-key" });
  });
});
