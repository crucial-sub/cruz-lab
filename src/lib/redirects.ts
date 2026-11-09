// 공개 주소 301 리다이렉트 규칙 (재건 2단계 Plan 7.4)
// - 미들웨어가 부른다. 쿠키를 읽거나 쓰지 않는다.
// - 한글 경로는 decodeURIComponent 뒤 NFC로 비교한다.
// - /blog/<옛 slug> → 새 slug는 글 페이지가 slugHistory로 처리한다(Firestore 조회가 필요해서).

// - 4단계(D11): 카테고리와 뜻이 같은 태그 주소(/blog/tag/javascript, /blog/tag/운영체제 …)는
//   /blog/category/<key>로 보낸다. 대소문자·공백이 다른 주소도 한 번에 카테고리로 간다.

import { categoryPath } from './public-paths.ts';
import { categoryForSynonymTag, normalizeTag } from './taxonomy.ts';

// 옛 연재 주소 → 새 주소
const LEGACY_SERIES_REDIRECTS: Readonly<Record<string, string>> = {
  wesbos: '/series/wesbos30',
  '크래프톤-정글': '/blog/tag/크래프톤-정글',
};

// 경로 조각을 디코딩하고 NFC로 맞춘다. 잘못된 인코딩이면 null
function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment).normalize('NFC');
  } catch {
    return null;
  }
}

// 요청 경로(인코딩된 그대로)를 받아 보낼 주소(인코딩됨)를 돌려준다. 보낼 곳이 없으면 null
export function findPublicRedirect(pathname: string): string | null {
  const trimmed = pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  const parts = trimmed.split('/');

  // /series/<옛 slug>
  if (parts.length === 3 && parts[1] === 'series') {
    const key = decodeSegment(parts[2]);
    const target = key ? LEGACY_SERIES_REDIRECTS[key] : undefined;
    return target ? encodeURI(target) : null;
  }

  // /blog/tag/<태그>
  if (parts.length === 4 && parts[1] === 'blog' && parts[2] === 'tag') {
    const raw = parts[3];
    const decoded = decodeSegment(raw);
    if (!decoded) return null;
    const normalized = normalizeTag(decoded);
    if (!normalized) return null;
    // 카테고리와 같은 뜻의 태그 → 카테고리 목록 (4단계 D11)
    const category = categoryForSynonymTag(normalized);
    if (category) return categoryPath(category);
    // 같은 값이라도 NFD로 들어왔으면(바이트가 다르면) NFC 주소로 보낸다
    if (normalized === decoded && decodeURIComponent(raw) === decoded) return null;
    return `/blog/tag/${encodeURIComponent(normalized)}`;
  }

  return null;
}
