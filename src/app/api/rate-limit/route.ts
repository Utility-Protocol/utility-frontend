import { checkTenantRateLimit, rateLimitHeaders, rateLimitResponse } from "@/utils/rateLimit/http";

export async function GET(request: Request) {
  const decision = checkTenantRateLimit(request);
  const blocked = rateLimitResponse(decision);

  if (blocked) return blocked;

  return Response.json(
    {
      ok: true,
      tenantId: decision.tenantId,
      remaining: decision.remaining,
    },
    {
      headers: rateLimitHeaders(decision),
    }
  );
}
