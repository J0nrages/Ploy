const SESSION_KEY = "ploy.sessionId";
const NAME_KEY = "ploy.displayName";

export function getSessionId(): string {
  if (typeof sessionStorage === "undefined") {
    return "test-session";
  }
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) {
    return existing;
  }
  const created = crypto.randomUUID();
  sessionStorage.setItem(SESSION_KEY, created);
  return created;
}

export function getStoredName(): string {
  if (typeof sessionStorage === "undefined") {
    return "Commander";
  }
  return sessionStorage.getItem(NAME_KEY) ?? "Commander";
}

export function storeName(name: string): void {
  if (typeof sessionStorage === "undefined") {
    return;
  }
  sessionStorage.setItem(NAME_KEY, name);
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
