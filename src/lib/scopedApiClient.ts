"use client";

import type { AuthScope } from "@/lib/supabase";
import {
  getValidSessionForScope,
  refreshSessionForScope,
} from "@/lib/supabase";
import { createScopedJsonApiClient } from "@/lib/scopedApiCore";

export async function createAuthenticatedApiClient(scope: AuthScope) {
  return createScopedJsonApiClient({
    getSession: () => getValidSessionForScope(scope),
    refreshSession: () => refreshSessionForScope(scope),
  });
}
