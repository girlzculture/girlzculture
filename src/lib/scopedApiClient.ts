"use client";

import type { AuthScope } from "@/lib/supabase";
import {
  getSessionForScope,
  refreshSessionForScope,
} from "@/lib/supabase";
import { createScopedJsonApiClient } from "@/lib/scopedApiCore";

export async function createAuthenticatedApiClient(scope: AuthScope) {
  return createScopedJsonApiClient({
    // Supabase already owns background token refresh. Use the current scoped
    // session for ordinary requests and refresh exactly once only after a real
    // 401. Pre-emptive refreshes can rotate a token while another upload or
    // dashboard request is still using it.
    getSession: () => getSessionForScope(scope),
    refreshSession: () => refreshSessionForScope(scope),
    scopeLabel:
      scope === "admin" ? "admin" : scope === "salon" ? "salon" : "customer",
  });
}
