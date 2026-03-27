export function resolveAdminAssetPreviewUrl(assetUrl?: string) {
  if (!assetUrl) return '';

  if (!assetUrl.startsWith('/uploads/')) {
    return assetUrl;
  }

  return `/api/admin/asset-preview?path=${encodeURIComponent(assetUrl)}`;
}

