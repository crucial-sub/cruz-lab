const DEFAULT_PUBLIC_SITE_URL = 'https://cruzlab.dev/';

function normalizeSiteUrl(value: string) {
  const normalized = value.endsWith('/') ? value : `${value}/`;
  return new URL(normalized).toString();
}

export function getPublishSiteInfo(request: Request) {
  const currentOrigin = new URL('/', request.url).toString();
  const configuredSite =
    import.meta.env.PUBLIC_SITE_URL || import.meta.env.SITE || DEFAULT_PUBLIC_SITE_URL;

  let publicSiteUrl = currentOrigin;

  try {
    publicSiteUrl = normalizeSiteUrl(configuredSite);
  } catch {
    publicSiteUrl = currentOrigin;
  }

  return {
    currentOrigin,
    publicSiteUrl,
  };
}

export function getPublicPostUrl(request: Request, slug: string) {
  const { publicSiteUrl } = getPublishSiteInfo(request);
  return new URL(`/blog/${slug}`, publicSiteUrl).toString();
}
