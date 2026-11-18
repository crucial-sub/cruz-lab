// "서가 문서" 목록 한 줄의 보조 글 (서가 1단계 T9)
// - 서가 화면 목록(src/library/ui/list-view.ts의 docMetaLine)과 같은 규칙: 문서 날짜, 없으면 올린 날(한국 시각) + "올림".
// - list-view.ts는 서버 모듈의 타입을 가져온다. 확장의 타입 검사가 Firebase Admin까지 따라가지 않도록 여기에 따로 둔다.
// - @raycast/api를 가져오지 않는다(루트 vitest가 시험한다).

import type { LibraryDocItem } from '../../../../src/library/client/docs.ts';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 한국 시각 기준 'YYYY-MM-DD'. 값이 없거나 틀리면 ''
function kstDate(iso: string | null): string {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  return new Date(time + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function docMeta(doc: Pick<LibraryDocItem, 'docDate' | 'formats' | 'uploadedAt'>): { date: string; formats: string } {
  const date = doc.docDate ?? `${kstDate(doc.uploadedAt)} 올림`;
  const formats = (['md', 'html'] as const).filter((format) => doc.formats[format]).join('·');
  return { date, formats };
}
