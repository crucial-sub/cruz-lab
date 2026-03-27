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

export async function probePublicSiteUrl(publicSiteUrl: string) {
  try {
    const response = await fetch(new URL('/blog', publicSiteUrl), { redirect: 'follow' });
    return {
      ready: response.ok,
      detail: response.ok
        ? `공개 사이트 응답 확인: ${response.status} ${response.statusText}`
        : `공개 사이트 응답 실패: ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    return {
      ready: false,
      detail: `공개 사이트 확인 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
    };
  }
}

export async function probePublicUrl(publicUrl: string) {
  try {
    const response = await fetch(publicUrl, { redirect: 'follow' });
    return {
      ready: response.ok,
      detail: response.ok
        ? `공개 페이지 응답 확인: ${response.status} ${response.statusText}`
        : `공개 페이지 응답 실패: ${response.status} ${response.statusText}`,
    };
  } catch (error) {
    return {
      ready: false,
      detail: `공개 페이지 확인 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`,
    };
  }
}
