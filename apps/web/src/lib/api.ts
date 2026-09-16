const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("atr_token");
}

export function setToken(token: string) {
  localStorage.setItem("atr_token", token);
}

export function clearToken() {
  localStorage.removeItem("atr_token");
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
      `Cannot reach API at ${API_URL}. Start it with: uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload`
    );
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => ({ detail: res.statusText }));
    const msg = typeof detail.detail === "string" ? detail.detail : JSON.stringify(detail.detail || detail);
    throw new Error(msg || "Request failed");
  }
  return res.json();
}

export { API_URL };