/**
 * In the browser we call same-origin `/api/...` and Next.js rewrites to FastAPI.
 * That avoids cross-port fetch failures (Cursor Simple Browser, CORS, etc.).
 * Server-side code can still hit the API directly via NEXT_PUBLIC_API_URL.
 */
const API_URL =
  typeof window === "undefined"
    ? process.env.NEXT_PUBLIC_API_URL || process.env.API_PROXY_TARGET || "http://127.0.0.1:8001"
    : "";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("atr_token");
}

export function setToken(token: string) {
  localStorage.setItem("atr_token", token);
}

export function clearToken() {
  localStorage.removeItem("atr_token");
  localStorage.removeItem("atr_role");
}

export function setRole(role: string) {
  localStorage.setItem("atr_role", role);
}

export function getRole(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("atr_role");
}

export function homeForRole(role?: string | null) {
  if (role === "admin") return "/admin";
  if (role === "candidate") return "/portal";
  return "/dashboard";
}

export async function api<T = unknown>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (options.auth !== false) {
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const url = `${API_URL}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    throw new Error(
      `Cannot reach API (tried ${url || path}). Keep uvicorn on port 8001 and refresh http://localhost:3000/interview/try`
    );
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    const msg =
      typeof detail.detail === "string" ? detail.detail : JSON.stringify(detail.detail || detail);
    throw new Error(msg || "Request failed");
  }
  return res.json();
}

export { API_URL };
