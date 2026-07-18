import { createRuntimeConfigAudit, buildRuntimeConfigMetrics } from "@/services/runtimeConfigAudit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = createRuntimeConfigAudit();
  const wantsMetrics = request.headers.get("accept")?.includes("text/plain");

  if (wantsMetrics) {
    return new Response(buildRuntimeConfigMetrics(result), {
      status: result.summary.critical > 0 ? 503 : 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return Response.json(result, { status: result.summary.critical > 0 ? 503 : 200 });
}
