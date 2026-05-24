const BASE_URL = process.env.EXPO_PUBLIC_API_URL || "https://backend.nexapay.space";

interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export async function apiRequest<T = any>(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  opts?: RequestOptions,
): Promise<{ ok: boolean; status: number; data: T }> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...opts?.headers,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts?.timeout || 15000);

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: "include",
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err: any) {
    clearTimeout(timer);
    return { ok: false, status: 0, data: { error: err.message || "Network error" } as any };
  }
}

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) =>
    apiRequest<T>("GET", path, undefined, { headers }),
  post: <T>(path: string, body?: Record<string, unknown>, headers?: Record<string, string>) =>
    apiRequest<T>("POST", path, body, { headers }),
  put: <T>(path: string, body?: Record<string, unknown>, headers?: Record<string, string>) =>
    apiRequest<T>("PUT", path, body, { headers }),
  delete: <T>(path: string, headers?: Record<string, string>) =>
    apiRequest<T>("DELETE", path, undefined, { headers }),
};
