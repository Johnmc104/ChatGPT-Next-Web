export interface AuthorizationSnapshot {
  hasUserKey: boolean;
  hasServerKey: boolean;
  needCode: boolean;
  hasAccessCode: boolean;
}

export type AuthorizationDecision =
  | { status: "authorized" }
  | { status: "missing-access-code" }
  | { status: "missing-server-key" };

/** Resolve the first-use authorization outcome without depending on React or a store. */
export function resolveAuthorization(
  snapshot: AuthorizationSnapshot,
): AuthorizationDecision {
  if (snapshot.hasUserKey) return { status: "authorized" };
  if (!snapshot.needCode && snapshot.hasServerKey) {
    return { status: "authorized" };
  }
  if (snapshot.needCode && !snapshot.hasAccessCode) {
    return { status: "missing-access-code" };
  }
  if (snapshot.needCode && snapshot.hasAccessCode && snapshot.hasServerKey) {
    return { status: "authorized" };
  }
  if (!snapshot.hasServerKey) return { status: "missing-server-key" };
  return { status: "authorized" };
}
