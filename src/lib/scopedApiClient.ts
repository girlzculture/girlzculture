"use client";

import type { AuthScope } from "@/lib/supabase";
import {
  getValidSessionForScope,
  refreshSessionForScope,
} from "@/lib/supabase";
import { createScopedJsonApiClient } from "@/lib/scopedApiCore";

export async function createAuthenticatedApiClient(scope: AuthScope) {
  return createScopedJsonApiClient({
    // Browser timers are throttled while a phone sleeps or a tab is in the
    // background. Validate the short expiry window before calling a protected
    // route so an ordinary token rollover does not create a false production
    // authentication incident. The role-scoped coordinator coalesces any
    // necessary refresh for simultaneous dashboard requests.
    getSession: () => getValidSessionForScope(scope, 30),
    refreshSession: () => refreshSessionForScope(scope),
    scopeLabel:
      scope === "admin" ? "admin" : scope === "salon" ? "salon" : "customer",
  });
}
