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

export function shouldRetryTransientAuthTokenResponse(
  input: RequestInfo | URL,
  status: number,
) {
  if (![502, 503, 504].includes(status)) return false;
  try {
    const pathname = new URL(
      input instanceof Request ? input.url : String(input),
    ).pathname;
    return /\/auth\/v1\/token\/?$/i.test(pathname);
  } catch {
    return false;
  }
}
