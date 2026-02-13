/**
 * Tests for the unified logger utility.
 */

// We need to control NODE_ENV, so we test via the actual module behaviour
// rather than mocking internals. The default test environment is "test",
// which means NODE_ENV !== "development", so MIN_LEVEL is "info".

describe("logger", () => {
  let logger: typeof import("@/app/utils/logger").logger;

  beforeEach(async () => {
    // Re-import to get a fresh module
    jest.resetModules();
    const mod = await import("@/app/utils/logger");
    logger = mod.logger;

    jest.spyOn(console, "debug").mockImplementation(() => {});
    jest.spyOn(console, "info").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("info() logs via console.info", () => {
    logger.info("[Test]", "hello");
    expect(console.info).toHaveBeenCalledWith("[Test]", "hello");
  });

  test("warn() logs via console.warn", () => {
    logger.warn("[Test]", "warning");
    expect(console.warn).toHaveBeenCalledWith("[Test]", "warning");
  });

  test("error() logs via console.error", () => {
    logger.error("[Test]", "error occurred");
    expect(console.error).toHaveBeenCalledWith("[Test]", "error occurred");
  });

  test("debug() is suppressed in non-development (test) mode", () => {
    logger.debug("[Test]", "debug message");
    expect(console.debug).not.toHaveBeenCalled();
  });

  test("masks OpenAI-style API keys in log output", () => {
    const key = "sk-abcdefghijklmnopqrstuvwxyz12345678";
    logger.info("[Auth]", `key is ${key}`);
    const loggedArg = (console.info as jest.Mock).mock.calls[0][1] as string;
    expect(loggedArg).not.toContain(key);
    expect(loggedArg).toContain("sk-abcde");
    expect(loggedArg).toContain("***");
  });

  test("masks Bearer tokens in log output", () => {
    const bearer = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.long_token_value";
    logger.info("[Auth]", bearer);
    const loggedArg = (console.info as jest.Mock).mock.calls[0][1] as string;
    expect(loggedArg).not.toBe(bearer);
    expect(loggedArg).toContain("***");
  });

  test("passes Error objects through without masking", () => {
    const error = new Error("test error");
    logger.error("[Test]", error);
    expect(console.error).toHaveBeenCalledWith("[Test]", error);
  });

  test("keyInfo logs key length when key is provided", () => {
    logger.keyInfo("[Test] api key", "mySecretKey123");
    const loggedArg = (console.info as jest.Mock).mock.calls[0][1] as string;
    expect(loggedArg).toContain("key length: 14");
    expect(loggedArg).toContain("mySec");
  });

  test("keyInfo logs 'key not set' when key is empty", () => {
    logger.keyInfo("[Test] api key", "");
    expect(console.info).toHaveBeenCalledWith("[Test] api key", "key not set");
  });

  test("keyInfo logs 'key not set' when key is null", () => {
    logger.keyInfo("[Test] api key", null);
    expect(console.info).toHaveBeenCalledWith("[Test] api key", "key not set");
  });

  test("keyInfo logs 'key not set' when key is undefined", () => {
    logger.keyInfo("[Test] api key");
    expect(console.info).toHaveBeenCalledWith("[Test] api key", "key not set");
  });

  test("stringifies objects in log output", () => {
    logger.info("[Test]", { foo: "bar", count: 42 });
    const loggedArg = (console.info as jest.Mock).mock.calls[0][1] as string;
    expect(loggedArg).toContain('"foo":"bar"');
    expect(loggedArg).toContain('"count":42');
  });
});
