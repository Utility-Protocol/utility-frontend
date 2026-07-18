"use client";

import { logger } from "@/utils/telemetry/structuredLogger";

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
const activeControllers = new Set<AbortController>();

export function setSessionToken(token: string | null) {
  sessionToken = token;
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export function abortAllRequests(): void {
  for (const ctrl of activeControllers) {
    ctrl.abort();
  }
  activeControllers.clear();
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
  activeControllers.add(controller);
  const timeoutId = setTimeout(() => controller.abort(), cfg.timeout);
  const startedAt = performance.now();

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

    logApiRequest(method, path, response.status, startedAt);

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
      logApiRequest(method, path, 0, startedAt, "Request timed out");
      return { data: null, error: "Request timed out", status: 0 };
    }
    logApiRequest(method, path, 0, startedAt, (err as Error).message || "Network error");
    return {
      data: null,
      error: (err as Error).message || "Network error",
      status: 0,
    };
  } finally {
    activeControllers.delete(controller);
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

function logApiRequest(
  method: HttpMethod,
  path: string,
  status: number,
  startedAt: number,
  errorMessage?: string
): void {
  const durationMs = Math.round(performance.now() - startedAt);
  const severityText = errorMessage || status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO";

  logger[severityText.toLowerCase() as "info" | "warn" | "error"]("API request completed", {
    "http.request.method": method,
    "http.response.status_code": status,
    "url.path": path,
    "duration.ms": durationMs,
    "error.message": errorMessage,
    "event.name": "api.request",
  });
}
