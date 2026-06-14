"use client";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiConfig {
  baseUrl: string;
  headers: Record<string, string>;
  timeout: number;
}

interface ApiResponse<T = unknown> {
  data: T | null;
  error: string | null;
  status: number;
}

const defaultConfig: ApiConfig = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000",
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 15000,
};

let sessionToken: string | null = null;

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

async function request<T>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  config?: Partial<ApiConfig>
): Promise<ApiResponse<T>> {
  const cfg = { ...defaultConfig, ...config };
  const url = `${cfg.baseUrl}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeout);

  try {
    const headers: Record<string, string> = { ...cfg.headers };
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    let data: T | null = null;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = (await response.json()) as T;
    }

    if (!response.ok) {
      return {
        data: null,
        error: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      };
    }

    return { data, error: null, status: response.status };
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as Error).name === "AbortError") {
      return { data: null, error: "Request timed out", status: 0 };
    }
    return {
      data: null,
      error: (err as Error).message || "Network error",
      status: 0,
    };
  }
}

export const api = {
  get: <T>(path: string, config?: Partial<ApiConfig>) =>
    request<T>("GET", path, undefined, config),
  post: <T>(path: string, body?: unknown, config?: Partial<ApiConfig>) =>
    request<T>("POST", path, body, config),
  put: <T>(path: string, body?: unknown, config?: Partial<ApiConfig>) =>
    request<T>("PUT", path, body, config),
  patch: <T>(path: string, body?: unknown, config?: Partial<ApiConfig>) =>
    request<T>("PATCH", path, body, config),
  delete: <T>(path: string, config?: Partial<ApiConfig>) =>
    request<T>("DELETE", path, undefined, config),
};
