export type EndpointValidationCode =
  | "required"
  | "invalid"
  | "protocol"
  | "credentials";

export interface EndpointValidation {
  valid: boolean;
  normalized?: string;
  code?: EndpointValidationCode;
}

/** Normalize an endpoint without changing relative application proxy paths. */
export function normalizeEndpointUrl(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) return trimmed.replace(/\/+$/, "");
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  const parsed = new URL(withProtocol);
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.toString().replace(/\/$/, "");
}

export function validateEndpointUrl(value: string): EndpointValidation {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, code: "required" };
  if (trimmed.startsWith("/")) {
    return { valid: true, normalized: trimmed.replace(/\/+$/, "") };
  }
  if (!/^https?:\/\//i.test(trimmed) && trimmed.includes("://")) {
    return { valid: false, code: "protocol" };
  }

  try {
    const normalized = normalizeEndpointUrl(trimmed);
    const parsed = new URL(normalized);
    if (parsed.username || parsed.password) {
      return { valid: false, code: "credentials" };
    }
    return { valid: true, normalized };
  } catch {
    return { valid: false, code: "invalid" };
  }
}
