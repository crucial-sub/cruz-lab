// 서가 문서 주소의 열기 판정 테스트 (서가 1단계 J7·J14)
// - html 판만 있으면 입장권을 만들고 읽음을 표시한 뒤 문서 출처로 보낸다(J6 독립 페이지).
// - md 판이 있으면 md 뷰어다(T7). 짝이어도 글(md)이 기본이고, ?v=html이면 그림(html)을 연다(사용자 결정 2026-11-18, 안 A).
// - md 뷰어도 입장권을 만든다. 페이지가 입장권 그림(&pixel=1)으로 문서 쿠키를 먼저 받는다(J12). 읽음을 표시한다.
// - 저장소 접근은 가짜 의존성으로 바꾼다.
import { describe, expect, it } from 'vitest';
import { resolveDocOpen, type DocOpenDeps } from '@/library/server/open';
import type { FormatState, LibraryDoc } from '@/library/server/store';
import { verifyTicket } from '@/library/ticket';

const SECRET = 'k'.repeat(48);
const NOW = Date.UTC(2026, 10, 18, 3, 0, 0);
const DOC = 'a1b2c3d4e5f6a7b8c9d0';
const ORIGIN = 'https://raw.cruzlab.dev';

const HTML: FormatState = { rev: 2, entry: 'index.html', bytes: 100, fileCount: 3 };
const MD: FormatState = { rev: 3, entry: 'index.md', bytes: 50, fileCount: 1 };

function doc(formats: LibraryDoc['formats']): LibraryDoc {
  const at = new Date(NOW);
  return {
    key: 'web:t:plan',
    sourcePath: null,
    project: 't',
    title: '시험 문서',
    docDate: '2026-11-18',
    formats,
    lastRev: 3,
    readAt: null,
    uploadedAt: at,
    updatedAt: at,
  };
}

function deps(stored: LibraryDoc | null, overrides: Partial<DocOpenDeps> = {}) {
  const loaded: string[] = [];
  const read: string[] = [];
  const value: DocOpenDeps = {
    now: () => NOW,
    secret: SECRET,
    docOrigin: ORIGIN,
    loadDoc: async (id) => {
      loaded.push(id);
      return id === DOC ? stored : null;
    },
    markRead: async (id) => {
      read.push(id);
      return true;
    },
    ...overrides,
  };
  return { value, loaded, read };
}

// 결과 주소의 입장권이 이 문서의 것인지 확인한다
function ticketDocId(location: string): string | null {
  const url = new URL(location);
  expect(`${url.origin}${url.pathname}`).toBe(`${ORIGIN}/d/_open`);
  return verifyTicket(url.searchParams.get('t'), NOW, SECRET);
}

describe('resolveDocOpen: html 문서 (J7, J6 독립 페이지)', () => {
  it('입장권을 만들어 문서 출처의 /d/_open으로 보내고 읽음을 표시한다', async () => {
    const d = deps(doc({ html: HTML }));
    const result = await resolveDocOpen(DOC, d.value);
    expect(result.kind).toBe('redirect');
    if (result.kind !== 'redirect') return;
    expect(ticketDocId(result.location)).toBe(DOC);
    expect(d.read).toEqual([DOC]);
  });

  it('md·html 짝에서 ?v=html이면 그림(html)을 연다', async () => {
    const d = deps(doc({ html: HTML, md: MD }));
    const result = await resolveDocOpen(DOC, d.value, 'html');
    expect(result.kind).toBe('redirect');
    if (result.kind !== 'redirect') return;
    expect(ticketDocId(result.location)).toBe(DOC);
    expect(d.read).toEqual([DOC]);
  });

  it('읽음 표시가 실패해도 문서를 연다', async () => {
    const d = deps(doc({ html: HTML }), {
      markRead: async () => {
        throw new Error('firestore down');
      },
    });
    const result = await resolveDocOpen(DOC, d.value);
    expect(result.kind).toBe('redirect');
  });

  it('입장권 비밀값이 짧으면 던진다(설정 문제를 숨기지 않는다)', async () => {
    const d = deps(doc({ html: HTML }), { secret: 'short' });
    await expect(resolveDocOpen(DOC, d.value)).rejects.toThrow(/LIBRARY_TICKET_SECRET/);
    expect(d.read).toEqual([]);
  });
});

describe('resolveDocOpen: md 뷰어 (T7, J12)', () => {
  // 입장권 그림 주소: {문서 출처}/d/_open?t={입장권}&pixel=1
  function pixelDocId(pixelUrl: string): string | null {
    expect(new URL(pixelUrl).searchParams.get('pixel')).toBe('1');
    return ticketDocId(pixelUrl);
  }

  it('md 판만 있으면 md 뷰어다. 입장권 그림 주소를 주고 읽음을 표시한다', async () => {
    const stored = doc({ md: MD });
    const d = deps(stored);
    const result = await resolveDocOpen(DOC, d.value);
    expect(result.kind).toBe('md');
    if (result.kind !== 'md') return;
    expect(result.doc).toBe(stored);
    expect(result.md).toEqual(MD);
    expect(result.hasHtml).toBe(false);
    expect(result.docOrigin).toBe(ORIGIN);
    expect(pixelDocId(result.ticketPixelUrl)).toBe(DOC);
    expect(d.read).toEqual([DOC]);
  });

  it('md·html 짝이면 글(md)이 기본이다', async () => {
    const d = deps(doc({ html: HTML, md: MD }));
    const result = await resolveDocOpen(DOC, d.value);
    expect(result.kind).toBe('md');
    if (result.kind !== 'md') return;
    expect(result.hasHtml).toBe(true);
    expect(d.read).toEqual([DOC]);
  });

  it('md 판만 있으면 ?v=html이어도 md 뷰어다', async () => {
    const d = deps(doc({ md: MD }));
    expect((await resolveDocOpen(DOC, d.value, 'html')).kind).toBe('md');
  });

  it('입장권 비밀값이 짧으면 읽음 표시 전에 던진다', async () => {
    const d = deps(doc({ md: MD }), { secret: 'short' });
    await expect(resolveDocOpen(DOC, d.value)).rejects.toThrow(/LIBRARY_TICKET_SECRET/);
    expect(d.read).toEqual([]);
  });
});

describe('resolveDocOpen: 없는 문서', () => {
  it('id 꼴이 틀리면 저장소를 읽지 않고 404', async () => {
    for (const id of [undefined, '', 'a/b', '../x', 'short']) {
      const d = deps(doc({ html: HTML }));
      expect(await resolveDocOpen(id, d.value)).toEqual({ kind: 'not-found' });
      expect(d.loaded).toEqual([]);
    }
  });

  it('없는 문서면 404이고 읽음을 표시하지 않는다', async () => {
    const d = deps(null);
    expect(await resolveDocOpen(DOC, d.value)).toEqual({ kind: 'not-found' });
    expect(await resolveDocOpen('ffffffffffffffffffff', d.value)).toEqual({ kind: 'not-found' });
    expect(d.read).toEqual([]);
  });
});
