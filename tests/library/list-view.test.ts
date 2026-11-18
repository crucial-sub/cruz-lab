// 서가 목록 묶기 테스트 (서가 1단계 T6, Plan J14)
import { describe, expect, it } from 'vitest';
import type { LibraryDocSummary } from '@/library/server/store';
import { docMetaLine, groupLibraryDocs, kstDate, projectChoices } from '@/library/ui/list-view';

function doc(id: string, project: string, extra: Partial<LibraryDocSummary> = {}): LibraryDocSummary {
  return {
    id,
    title: id,
    project,
    docDate: null,
    formats: { html: { rev: 1, entry: 'index.html', bytes: 10, fileCount: 1 } },
    unread: false,
    readAt: null,
    uploadedAt: '2026-11-16T16:30:00.000Z',
    updatedAt: '2026-11-16T16:30:00.000Z',
    url: `https://www.cruzlab.dev/admin/library/d/${id}`,
    ...extra,
  };
}

describe('groupLibraryDocs', () => {
  it('안 읽은 문서를 위로 모으고, 프로젝트 묶음은 최근 문서 순서를 지킨다', () => {
    const docs = [
      doc('a', 'beer-pour', { unread: true }),
      doc('b', 'cruz-lab'),
      doc('c', 'beer-pour'),
      doc('d', 'desktop', { unread: true }),
    ];
    const view = groupLibraryDocs(docs);
    expect(view.unread.map((d) => d.id)).toEqual(['a', 'd']);
    expect(view.projects.map((group) => [group.name, group.docs.map((d) => d.id)])).toEqual([
      ['beer-pour', ['a', 'c']],
      ['cruz-lab', ['b']],
      ['desktop', ['d']],
    ]);
  });

  it('빈 서가', () => {
    expect(groupLibraryDocs([])).toEqual({ unread: [], projects: [] });
  });
});

describe('kstDate·docMetaLine', () => {
  it('한국 시각으로 날짜를 바꾼다 (UTC 16:30은 다음 날 01:30)', () => {
    expect(kstDate('2026-11-16T16:30:00.000Z')).toBe('2026-11-17');
    expect(kstDate(null)).toBe('');
    expect(kstDate('틀린 값')).toBe('');
  });

  it('문서 날짜가 있으면 그것을, 없으면 올린 날을 쓴다. 형식은 md·html 순서', () => {
    expect(docMetaLine(doc('a', 'x', { docDate: '2026-11-16' }))).toBe('2026-11-16 · html');
    expect(
      docMetaLine(
        doc('a', 'x', {
          formats: {
            html: { rev: 2, entry: 'index.html', bytes: 1, fileCount: 1 },
            md: { rev: 1, entry: 'index.md', bytes: 1, fileCount: 1 },
          },
        }),
      ),
    ).toBe('2026-11-17 올림 · md·html');
  });
});

describe('projectChoices', () => {
  it('서가의 프로젝트와 desktop을 겹치지 않게 정렬한다', () => {
    expect(projectChoices([doc('a', 'cruz-lab'), doc('b', 'beer-pour'), doc('c', 'cruz-lab')])).toEqual([
      'beer-pour',
      'cruz-lab',
      'desktop',
    ]);
  });
});
