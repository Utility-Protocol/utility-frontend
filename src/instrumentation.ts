import { type Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { configureStructuredLogger, logger } = await import("@/utils/telemetry/structuredLogger");
    configureStructuredLogger({
      serviceName: process.env.OTEL_SERVICE_NAME ?? "utility-frontend",
      serviceVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.npm_package_version,
    });
    logger.info("Next.js server instrumentation registered", {
      "deployment.environment.name": process.env.NODE_ENV ?? "development",
    });
  }
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const { logger, parseTraceParent } = await import("@/utils/telemetry/structuredLogger");

  const normalizedError = normalizeError(error);

  logger.error("Unhandled Next.js request error", {
    "exception.type": normalizedError.name,
    "exception.message": normalizedError.message,
    "exception.stacktrace": normalizedError.stack,
    "error.digest": normalizedError.digest,
    "http.request.method": request.method,
    "url.path": request.path,
    "next.router.kind": context.routerKind,
    "next.route.path": context.routePath,
    "next.route.type": context.routeType,
    "next.render.source": context.renderSource,
    "next.revalidate.reason": context.revalidateReason,
  }, parseTraceParent(getHeader(request.headers, "traceparent")));
};

function getHeader(headers: NodeJS.Dict<string | string[]>, name: string): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function normalizeError(error: unknown): {
  name: string;
  message: string;
  stack?: string;
  digest?: string;
} {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      digest: "digest" in error ? String(error.digest) : undefined,
    };
  }

  return {
    name: "UnknownError",
    message: String(error),
  };
}
