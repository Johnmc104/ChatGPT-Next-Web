import { ACCESS_CODE_PREFIX } from "../../constant";

export type AuthorizationError =
  | "missing-code"
  | "invalid-code"
  | "user-key-disabled"
  | "missing-server-key"
  | "network"
  | "timeout"
  | "server";
export type AuthorizationResult =
  | { ok: true }
  | { ok: false; code: AuthorizationError };

/** Check site access policy without invoking an upstream model. */
export async function checkAuthorization(
  accessCode: string,
  apiKey = "",
): Promise<AuthorizationResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const token =
    apiKey.trim() ||
    (accessCode.trim() ? ACCESS_CODE_PREFIX + accessCode.trim() : "");
  try {
    const response = await fetch("/api/auth/check", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.json();
    if (response.ok && body.ok === true) return { ok: true };
    const codes: AuthorizationError[] = [
      "missing-code",
      "invalid-code",
      "user-key-disabled",
      "missing-server-key",
    ];
    return {
      ok: false,
      code: codes.includes(body.code) ? body.code : "server",
    };
  } catch {
    return {
      ok: false,
      code: controller.signal.aborted ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timer);
  }
}
