import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/workspace";
import { ensureDefaultWorkspace } from "@/repositories/workspace-repository";
import { getRequestRateLimitKey, checkRateLimit } from "@/services/security/rate-limit";

export async function requireWorkspace(request: Request) {
  const user = await getAuthenticatedUser();

  const rateLimit = checkRateLimit(getRequestRateLimitKey(request, user?.id), user ? 180 : 40);

  if (!rateLimit.allowed) {
    return {
      response: NextResponse.json(
        { error: "Muitas requisicoes. Tente novamente em instantes." },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000))
          }
        }
      )
    };
  }

  if (!user) {
    return { response: NextResponse.json({ error: "Nao autenticado." }, { status: 401 }) };
  }

  const workspace = await ensureDefaultWorkspace(user);
  return { user, workspace };
}
