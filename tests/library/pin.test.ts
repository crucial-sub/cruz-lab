// 고정 (서가 2단계 T4, Plan J34)
// - 문서 기록에 pinnedAt 선택 칸. 없으면 1단계 문서와 같다(모르는 칸을 버리는 옛 코드도 읽는다, Plan 1.3절 9).
// - 목록 맨 위 "고정" 칸: 최근에 고정한 것부터. 그 아래 "새로 올린 문서", 프로젝트 묶음은 그대로다.
import { describe, expect, it } from 'vitest';
import { libraryDocSchema, summarize, type LibraryDocSummary } from '@/library/server/store';
import { groupLibraryDocs } from '@/library/ui/list-view';

const stage1Doc = {
  key: 'mac:~/projects/p/a',
  sourcePath: '~/projects/p/a.md',
  project: 'p',
  title: '문서',
  docDate: null,
  formats: { md: { rev: 1, entry: 'index.md', bytes: 10, fileCount: 1 } },
  lastRev: 1,
  readAt: null,
  uploadedAt: new Date('2026-11-18T00:00:00Z'),
  updatedAt: new Date('2026-11-18T00:00:00Z'),
};

describe('문서 기록의 pinnedAt', () => {
  it('1단계 문서(칸 없음)를 읽고, 요약의 pinnedAt은 null이다', () => {
    const doc = libraryDocSchema.parse(stage1Doc);
    expect(summarize('d1', doc, 'https://www.cruzlab.dev').pinnedAt).toBeNull();
  });

  it('고정한 문서는 요약에 고정 시각(ISO)이 있다', () => {
    const doc = libraryDocSchema.parse({ ...stage1Doc, pinnedAt: new Date('2026-11-19T01:02:03Z') });
    expect(summarize('d1', doc, 'https://www.cruzlab.dev').pinnedAt).toBe('2026-11-19T01:02:03.000Z');
  });
});

function row(id: string, extra: Partial<LibraryDocSummary> = {}): LibraryDocSummary {
  return {
    id,
    title: id,
    project: 'p',
    docDate: null,
    formats: { md: { rev: 1, entry: 'index.md', bytes: 10, fileCount: 1 } },
    unread: false,
    readAt: null,
    pinnedAt: null,
    uploadedAt: '2026-11-16T16:30:00.000Z',
    updatedAt: '2026-11-16T16:30:00.000Z',
    url: `https://www.cruzlab.dev/admin/library/d/${id}`,
    ...extra,
  };
}

describe('groupLibraryDocs: 고정 칸', () => {
  it('고정한 문서를 맨 위 칸에 최근 고정 순서로 모은다. 프로젝트 묶음에도 그대로 있다', () => {
    const docs = [
      row('a'),
      row('b', { pinnedAt: '2026-11-19T01:00:00.000Z' }),
      row('c', { pinnedAt: '2026-11-19T02:00:00.000Z', unread: true }),
    ];
    const view = groupLibraryDocs(docs);
    expect(view.pinned.map((doc) => doc.id)).toEqual(['c', 'b']);
    expect(view.unread.map((doc) => doc.id)).toEqual(['c']);
    expect(view.projects[0].docs.map((doc) => doc.id)).toEqual(['a', 'b', 'c']);
  });

  it('고정한 문서가 없으면 고정 칸이 비어 있다', () => {
    expect(groupLibraryDocs([row('a')]).pinned).toEqual([]);
  });
});
