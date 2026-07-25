"use client";

import { getTracer, propagator } from "@/utils/telemetry/tracing";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ApiConfig {
  baseUrl: string;
  headers: Record<string, string>;
  timeout: number;
  sensitivePayloadEncryption?: import("./sensitivePayloadEncryption").SensitivePayloadEncryptionOptions;
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

async function prepareRequestBody(body: unknown, config: ApiConfig): Promise<unknown> {
  if (!config.sensitivePayloadEncryption) return body;
  const { encryptSensitivePayload } = await import("./sensitivePayloadEncryption");
  const result = await encryptSensitivePayload(body, config.sensitivePayloadEncryption);
  if (result.encryptedFieldCount > 0) {
    if (result.durationMs > 100) {
      console.warn(`Sensitive payload encryption exceeded 100ms target: ${result.durationMs.toFixed(1)}ms`);
    }
  }
  return result.payload;
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

  const tracer = getTracer();
  const span = tracer.startSpan(`HTTP ${method}`);
  span.setAttributes({
    "http.method": method,
    "http.url": url,
    "http.target": path,
  });

  try {
    const headers: Record<string, string> = { ...cfg.headers };
    if (sessionToken) {
      headers["Authorization"] = `Bearer ${sessionToken}`;
    }

    // Inject W3C Trace Context
    propagator.inject(span.context, headers);

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(await prepareRequestBody(body, cfg)) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    span.setAttribute("http.status_code", response.status);

    let data: T | null = null;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = (await response.json()) as T;
    }

    if (!response.ok) {
      span.setStatus({
        code: "ERROR",
        message: `HTTP ${response.status}: ${response.statusText}`,
      });
      return {
        data: null,
        error: `HTTP ${response.status}: ${response.statusText}`,
        status: response.status,
      };
    }

    span.setStatus("OK");
    return { data, error: null, status: response.status };
  } catch (err) {
    clearTimeout(timeoutId);
    span.recordException(err as Error);
    if ((err as Error).name === "AbortError") {
      span.setAttribute("http.status_code", 0);
      return { data: null, error: "Request timed out", status: 0 };
    }
    return {
      data: null,
      error: (err as Error).message || "Network error",
      status: 0,
    };
  } finally {
    activeControllers.delete(controller);
    span.end();
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
