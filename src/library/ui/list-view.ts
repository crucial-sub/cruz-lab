// 서가 목록 묶기 (서가 1단계 T6, Plan J14·분석 8.2)
// - 위: 새로 올린 문서(안 읽음), 최근 올린 것부터.
// - 아래: 프로젝트별 묶음. 프로젝트 순서는 그 프로젝트에서 가장 최근에 올린 문서 순서다.
//   묶음에는 안 읽은 문서도 들어간다(프로젝트 하나의 문서가 한곳에 다 보인다).
// - I/O가 없는 순수 함수다. 목록은 최근 올린 것부터 들어온다고 본다(listLibraryDocs의 순서).

import type { LibraryDocSummary } from '../server/store';

export interface ProjectGroup {
  name: string;
  docs: LibraryDocSummary[];
}

export interface LibraryListView {
  unread: LibraryDocSummary[];
  projects: ProjectGroup[];
}

export function groupLibraryDocs(docs: readonly LibraryDocSummary[]): LibraryListView {
  const unread = docs.filter((doc) => doc.unread);
  const byProject = new Map<string, LibraryDocSummary[]>();
  for (const doc of docs) byProject.set(doc.project, [...(byProject.get(doc.project) ?? []), doc]);
  return { unread, projects: [...byProject].map(([name, list]) => ({ name, docs: list })) };
}

// 한국 시각 기준 날짜 'YYYY-MM-DD'. 값이 없거나 틀리면 ''
export function kstDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 문서 한 줄의 보조 글: 문서 날짜(없으면 올린 날) · 형식
// - 형식 이름은 사용자가 아는 확장자를 그대로 쓴다(md, html)
export function docMetaLine(doc: LibraryDocSummary): string {
  const date = doc.docDate ?? `${kstDate(doc.uploadedAt)} 올림`;
  const formats = (['md', 'html'] as const).filter((format) => doc.formats[format]).join('·');
  return [date, formats].filter(Boolean).join(' · ');
}

// 프로젝트 고르기 칸의 후보: 서가에 있는 프로젝트 + 'desktop'(바탕화면 문서 폴더, J13)
export function projectChoices(docs: readonly LibraryDocSummary[]): string[] {
  const names = new Set(docs.map((doc) => doc.project));
  names.add('desktop');
  return [...names].sort((a, b) => a.localeCompare(b, 'ko'));
}
