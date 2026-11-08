// 제목 → slug 제안 (재건 3단계 D13 "slug(제목에서 제안 버튼)")
// - 결과는 taxonomy.ts의 SLUG_PATTERN(소문자 영문·숫자·한글 묶음을 '-'로 잇는다)을 지키거나 빈 문자열이다.
// - 제목 앞의 "[접두사]"는 뗀다(기존 글 제목 관례).

import { isValidSlug, stripTitlePrefix } from '@/lib/taxonomy';

export function suggestSlug(title: string): string {
  const slug = stripTitlePrefix(title)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9가-힣-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return isValidSlug(slug) ? slug : '';
}
