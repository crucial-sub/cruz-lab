// 서가 목록 묶기 (서가 1단계 T6, Plan J14·분석 8.2)
// - 위: 새로 올린 문서(안 읽음), 최근 올린 것부터.
// - 아래: 프로젝트별 묶음. 프로젝트 순서는 그 프로젝트에서 가장 최근에 올린 문서 순서다.
//   묶음에는 안 읽은 문서도 들어간다(프로젝트 하나의 문서가 한곳에 다 보인다).
// - I/O가 없는 순수 함수다. 목록은 최근 올린 것부터 들어온다고 본다(listLibraryDocs의 순서).

import type { LibraryDocSummary } from '../server/store';
import { shareCoversDoc, type ShareScope } from '../share';

export interface ProjectGroup {
  name: string;
  docs: LibraryDocSummary[];
}

export interface LibraryListView {
  pinned: LibraryDocSummary[];
  unread: LibraryDocSummary[];
  projects: ProjectGroup[];
}

// - 서가 2단계 J34: 맨 위 "고정" 칸. 최근에 고정한 것부터. 고정한 문서도 아래 칸들에 그대로 있다
export function groupLibraryDocs(docs: readonly LibraryDocSummary[]): LibraryListView {
  const pinned = docs
    .filter((doc) => Boolean(doc.pinnedAt))
    .sort((a, b) => (b.pinnedAt ?? '').localeCompare(a.pinnedAt ?? ''));
  const unread = docs.filter((doc) => doc.unread);
  const byProject = new Map<string, LibraryDocSummary[]>();
  for (const doc of docs) byProject.set(doc.project, [...(byProject.get(doc.project) ?? []), doc]);
  return { pinned, unread, projects: [...byProject].map(([name, list]) => ({ name, docs: list })) };
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

// 아이폰에서 홈 화면 웹 앱으로 열렸는가 (서가 2단계 J23)
// - navigator.standalone은 iOS Safari에만 있다. 홈 화면에 "웹 앱으로 열기"를 켠 채 추가하면 참이다.
// - 웹 앱은 Safari와 로그인·저장을 따로 쓴다(Plan 1.3절 2). 그래서 목록 맨 위에 안내 한 줄을 보인다.
export function isIosWebApp(nav: { standalone?: unknown }): boolean {
  return nav.standalone === true;
}

// 프로젝트 공유 창이 고르는 폴더 (서가 2단계 J51): 그 프로젝트 문서의 폴더와 그 상위 폴더 모두, 한국어 순서
// - 뿌리 문서(폴더 '')는 "프로젝트 전체"로 공유한다. 그래서 빈 값은 뺀다
export function projectFolders(docs: readonly LibraryDocSummary[], project: string): string[] {
  const folders = new Set<string>();
  for (const doc of docs) {
    if (doc.project !== project || !doc.folder) continue;
    const parts = doc.folder.split('/');
    for (let length = 1; length <= parts.length; length += 1) folders.add(parts.slice(0, length).join('/'));
  }
  return [...folders].sort((a, b) => a.localeCompare(b, 'ko'));
}

// 살아 있는 공유 중 하나라도 덮는 문서 id (서가 2단계 J52: 목록의 "공유 중" 표시). 판정은 share.ts 하나다
export function sharedDocIds(shares: readonly { scope: ShareScope }[], docs: readonly LibraryDocSummary[]): Set<string> {
  const ids = new Set<string>();
  for (const doc of docs) {
    if (shares.some((share) => shareCoversDoc(share.scope, doc))) ids.add(doc.id);
  }
  return ids;
}
