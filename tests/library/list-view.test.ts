// 서가 목록 묶기 테스트 (서가 1단계 T6, Plan J14)
import { describe, expect, it } from 'vitest';
import type { LibraryDocSummary } from '@/library/server/store';
import {
  docMetaLine,
  groupLibraryDocs,
  isIosWebApp,
  kstDate,
  projectChoices,
  projectFolders,
  sharedDocIds,
} from '@/library/ui/list-view';

function doc(id: string, project: string, extra: Partial<LibraryDocSummary> = {}): LibraryDocSummary {
  return {
    id,
    title: id,
    project,
    docDate: null,
    formats: { html: { rev: 1, entry: 'index.html', bytes: 10, fileCount: 1 } },
    unread: false,
    readAt: null,
    pinnedAt: null,
    mdPendingRev: null,
    folder: '',
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
    expect(groupLibraryDocs([])).toEqual({ pinned: [], unread: [], projects: [] });
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

// 서가 2단계 J23: 아이폰에서 웹 앱으로 열렸는지 (navigator.standalone은 iOS Safari에만 있다)
describe('isIosWebApp', () => {
  it('navigator.standalone이 참일 때만 참이다', () => {
    expect(isIosWebApp({ standalone: true })).toBe(true);
    expect(isIosWebApp({ standalone: false })).toBe(false);
    // 안드로이드·데스크톱 브라우저에는 이 속성이 없다
    expect(isIosWebApp({})).toBe(false);
    expect(isIosWebApp({ standalone: 'true' })).toBe(false);
  });
});

// 서가 2단계 T9 (Plan J51·J52)
describe('projectFolders: 프로젝트 공유 창이 고르는 폴더', () => {
  it('그 프로젝트 문서의 폴더와 상위 폴더를 모두, 한국어 순서로. 뿌리(빈 값)는 뺀다', () => {
    const docs = [
      doc('a', 'p', { folder: 'bundles/a/b' }),
      doc('b', 'p', { folder: 'bundles2' }),
      doc('c', 'p', { folder: '' }),
      doc('d', 'q', { folder: 'other' }),
    ];
    expect(projectFolders(docs, 'p')).toEqual(['bundles', 'bundles/a', 'bundles/a/b', 'bundles2']);
    expect(projectFolders(docs, 'none')).toEqual([]);
  });
});

describe('sharedDocIds: 목록의 "공유 중" 표시', () => {
  it('살아 있는 공유 중 하나라도 덮는 문서 id', () => {
    const docs = [doc('aaaaaaaaaaaaaaaaaaaa', 'p', { folder: 'bundles/a' }), doc('bbbbbbbbbbbbbbbbbbbb', 'p', { folder: 'bundles2' }), doc('cccccccccccccccccccc', 'q')];
    const shares = [
      { scope: { kind: 'folder' as const, project: 'p', folder: 'bundles' } },
      { scope: { kind: 'doc' as const, docId: 'cccccccccccccccccccc' } },
    ];
    expect([...sharedDocIds(shares, docs)].sort()).toEqual(['aaaaaaaaaaaaaaaaaaaa', 'cccccccccccccccccccc']);
    expect(sharedDocIds([], docs).size).toBe(0);
  });
});
