export function shouldPreserveSupabaseAuthResponse(input: RequestInfo | URL) {
  try {
    const pathname = new URL(
      input instanceof Request ? input.url : String(input),
    ).pathname;
    return pathname.startsWith("/auth/v1/");
  } catch {
    return false;
  }
}
