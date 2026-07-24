export function stripBrandAssetVersion(url: string) {
  return url.replace(/[?&]v=\d+$/, "");
}

export function versionBrandAssetUrl(url: string, version: number) {
  const base = stripBrandAssetVersion(url);
  return `${base}${base.includes("?") ? "&" : "?"}v=${version}`;
}

export function normalizeBrandFocalPoint(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return Math.round(parsed * 100) / 100;
}
