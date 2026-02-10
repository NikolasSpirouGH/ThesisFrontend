const TOKEN_KEY = "jwt";
const USER_KEY = "user";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuth() {
  console.trace("clearAuth() called - stack trace:");
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function setUser(user: unknown | null) {
  if (user == null) {
    localStorage.removeItem(USER_KEY);
    return;
  }
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // fallback to string coercion if object is not serialisable
    localStorage.setItem(USER_KEY, String(user));
  }
}

export function getUser<T = unknown>(): T | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

export function getCurrentUsername(): string | null {
  const user = getUser<{ username?: string }>();
  return user?.username ?? null;
}
