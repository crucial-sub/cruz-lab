// 공유 서버 판정 테스트 (서가 2단계 T8, Plan J44~J47·J53)
// - 저장소는 메모리 가짜를 넣는다. 공유 열기 판정(문서 하나·묶음·범위 밖·끝남·꺼짐), 문서 출처의 공유 확인,
//   공유 만들기 검사, 공유 중 목록, 올리기 결과의 sharedBy를 본다.
import { describe, expect, it } from 'vitest';
import type { LibraryDoc } from '@/library/server/store';
import {
  checkShareAccessWith,
  createShareWith,
  listLiveSharesWith,
  resolveShareOpenWith,
  revokeShareWith,
  sharesCoveringDocWith,
  type ShareStoreDeps,
  type StoredShare,
} from '@/library/server/shares';
import { verifyShareTicket } from '@/library/ticket';

const NOW = Date.UTC(2026, 10, 20, 3, 0, 0);
const SECRET = 'k'.repeat(48);
const DAY = 24 * 60 * 60 * 1000;
const SHARE = 'AbCdEfGhIjKlMnOpQrStUv_-';
const TS = { toDate: () => new Date(NOW) };

function doc(key: string, project: string, title: string, formats: LibraryDoc['formats']): LibraryDoc {
  return {
    key,
    sourcePath: null,
    project,
    title,
    docDate: null,
    formats,
    lastRev: 3,
    readAt: null,
    uploadedAt: TS,
    updatedAt: TS,
  } as LibraryDoc;
}

const MD = { rev: 2, entry: 'index.md', bytes: 10, fileCount: 1 };
const HTML = { rev: 3, entry: 'index.html', bytes: 10, fileCount: 1 };

// 문서 넷: 같은 프로젝트의 bundles/a, bundles2, 뿌리, 다른 프로젝트
const DOCS: Record<string, LibraryDoc> = {
  aaaaaaaaaaaaaaaaaaaa: doc('mac:~/projects/interview-lab/bundles/a/q1', 'interview-lab', '질문 1', { md: MD }),
  bbbbbbbbbbbbbbbbbbbb: doc('mac:~/projects/interview-lab/bundles2/q2', 'interview-lab', '질문 2', { html: HTML }),
  cccccccccccccccccccc: doc('mac:~/projects/interview-lab/readme', 'interview-lab', '읽기', { md: MD, html: HTML }),
  dddddddddddddddddddd: doc('mac:~/projects/cruz-lab/plan', 'cruz-lab', '계획', { md: MD }),
};

function store(shares: Record<string, StoredShare>): ShareStoreDeps & { shares: Record<string, StoredShare>; reads: string[] } {
  const reads: string[] = [];
  return {
    shares,
    reads,
    now: () => NOW,
    newId: () => SHARE,
    getShare: async (id) => {
      reads.push(`share:${id}`);
      return shares[id] ?? null;
    },
    getDoc: async (id) => {
      reads.push(`doc:${id}`);
      return DOCS[id] ?? null;
    },
    listDocs: async (project: string) => {
      reads.push(`docs:${project}`);
      return Object.entries(DOCS)
        .filter(([, value]) => value.project === project)
        .map(([id, value]) => ({ id, doc: value }));
    },
    listShares: async () => Object.entries(shares).map(([id, value]) => ({ id, share: value })),
    createShare: async (id, share) => {
      if (shares[id]) throw new Error('있음');
      shares[id] = share;
    },
    revokeShare: async (id, atMs) => {
      const share = shares[id];
      if (!share) return false;
      if (share.revokedAtMs === null) shares[id] = { ...share, revokedAtMs: atMs };
      return true;
    },
  };
}

const live = (scope: StoredShare['scope'], expiresAtMs: number | null = null): StoredShare => ({
  scope,
  expiresAtMs,
  revokedAtMs: null,
  createdAtMs: NOW - DAY,
});

const OPEN = { secret: SECRET, docOrigin: 'https://raw.cruzlab.dev' };

describe('문서 출처의 공유 확인 checkShareAccessWith (J47)', () => {
  it('살아 있고 범위 안이면 끝나는 시각을 준다', async () => {
    const deps = store({ [SHARE]: live({ kind: 'folder', project: 'interview-lab', folder: 'bundles' }, NOW + DAY) });
    expect(await checkShareAccessWith(deps, SHARE, 'aaaaaaaaaaaaaaaaaaaa')).toEqual({ expiresAtMs: NOW + DAY });
  });

  it('범위 밖(bundles2·다른 프로젝트), 없는 문서는 null', async () => {
    const deps = store({ [SHARE]: live({ kind: 'folder', project: 'interview-lab', folder: 'bundles' }) });
    expect(await checkShareAccessWith(deps, SHARE, 'bbbbbbbbbbbbbbbbbbbb')).toBeNull();
    expect(await checkShareAccessWith(deps, SHARE, 'dddddddddddddddddddd')).toBeNull();
    expect(await checkShareAccessWith(deps, SHARE, 'zzzzzzzzzzzzzzzzzzzz')).toBeNull();
  });

  it('끈 공유·끝난 공유·없는 공유는 null', async () => {
    const scope = { kind: 'project', project: 'interview-lab' } as const;
    const revoked = store({ [SHARE]: { ...live(scope), revokedAtMs: NOW - 1 } });
    const expired = store({ [SHARE]: live(scope, NOW) });
    expect(await checkShareAccessWith(revoked, SHARE, 'aaaaaaaaaaaaaaaaaaaa')).toBeNull();
    expect(await checkShareAccessWith(expired, SHARE, 'aaaaaaaaaaaaaaaaaaaa')).toBeNull();
    expect(await checkShareAccessWith(store({}), SHARE, 'aaaaaaaaaaaaaaaaaaaa')).toBeNull();
  });

  it('문서 하나 공유는 다른 문서 id면 문서를 읽지 않고 null', async () => {
    const deps = store({ [SHARE]: live({ kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa' }) });
    expect(await checkShareAccessWith(deps, SHARE, 'cccccccccccccccccccc')).toBeNull();
    expect(deps.reads).toEqual([`share:${SHARE}`]);
  });
});

describe('공유 주소 열기 판정 resolveShareOpenWith (J46)', () => {
  it('문서 하나(md): 공유 md 화면. 그림은 공유 입장권 그림으로 받는다', async () => {
    const deps = store({ [SHARE]: live({ kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa' }) });
    const result = await resolveShareOpenWith({ ...deps, ...OPEN }, SHARE, null, null);
    expect(result.kind).toBe('md');
    if (result.kind !== 'md') return;
    expect(result.docId).toBe('aaaaaaaaaaaaaaaaaaaa');
    expect(result.bundle).toBe(false);
    expect(result.label).toBe('질문 1');
    const url = new URL(result.ticketPixelUrl);
    expect(url.origin + url.pathname).toBe('https://raw.cruzlab.dev/d/_open');
    expect(url.searchParams.get('pixel')).toBe('1');
    expect(verifyShareTicket(url.searchParams.get('t'), NOW, SECRET)).toEqual({ docId: 'aaaaaaaaaaaaaaaaaaaa', shareId: SHARE });
  });

  it('문서 하나(html만): 공유 입장권으로 문서 출처에 302', async () => {
    const deps = store({ [SHARE]: live({ kind: 'doc', docId: 'bbbbbbbbbbbbbbbbbbbb' }) });
    const result = await resolveShareOpenWith({ ...deps, ...OPEN }, SHARE, null, null);
    expect(result.kind).toBe('redirect');
    if (result.kind !== 'redirect') return;
    const url = new URL(result.location);
    expect(url.pathname).toBe('/d/_open');
    expect(url.searchParams.get('pixel')).toBeNull();
    expect(verifyShareTicket(url.searchParams.get('t'), NOW, SECRET)?.docId).toBe('bbbbbbbbbbbbbbbbbbbb');
  });

  it('md·html 짝: 글이 기본, ?v=html이면 그림(문서 출처)', async () => {
    const deps = store({ [SHARE]: live({ kind: 'project', project: 'interview-lab' }) });
    const md = await resolveShareOpenWith({ ...deps, ...OPEN }, SHARE, 'cccccccccccccccccccc', null);
    expect(md.kind).toBe('md');
    if (md.kind === 'md') expect(md.hasHtml).toBe(true);
    const html = await resolveShareOpenWith({ ...deps, ...OPEN }, SHARE, 'cccccccccccccccccccc', 'html');
    expect(html.kind).toBe('redirect');
  });

  it('묶음(폴더): 범위 안 문서 목록. 폴더·제목 순, 하위 폴더 포함, bundles2와 다른 프로젝트 빼기', async () => {
    const deps = store({ [SHARE]: live({ kind: 'folder', project: 'interview-lab', folder: 'bundles' }, NOW + DAY) });
    const result = await resolveShareOpenWith({ ...deps, ...OPEN }, SHARE, null, null);
    expect(result.kind).toBe('list');
    if (result.kind !== 'list') return;
    expect(result.label).toBe('interview-lab · bundles');
    expect(result.docs.map((item) => item.id)).toEqual(['aaaaaaaaaaaaaaaaaaaa']);
    expect(result.docs[0]).toMatchObject({ title: '질문 1', folder: 'bundles/a', formats: ['md'] });
  });

  it('묶음 목록은 그 프로젝트 문서만 묻는다 (PR-C 검토 중요 2)', async () => {
    const deps = store({ [SHARE]: live({ kind: 'folder', project: 'interview-lab', folder: 'bundles' }) });
    await resolveShareOpenWith({ ...deps, ...OPEN }, SHARE, null, null);
    expect(deps.reads.filter((line) => line.startsWith('docs:'))).toEqual(['docs:interview-lab']);
  });

  it('묶음(프로젝트): 뿌리 문서가 앞(폴더 순)', async () => {
    const deps = store({ [SHARE]: live({ kind: 'project', project: 'interview-lab' }) });
    const result = await resolveShareOpenWith({ ...deps, ...OPEN }, SHARE, null, null);
    if (result.kind !== 'list') throw new Error(result.kind);
    expect(result.docs.map((item) => item.folder)).toEqual(['', 'bundles/a', 'bundles2']);
  });

  it('묶음 안 문서: 범위 안이면 열고, 범위 밖이면 404', async () => {
    const deps = store({ [SHARE]: live({ kind: 'folder', project: 'interview-lab', folder: 'bundles' }) });
    const inside = await resolveShareOpenWith({ ...deps, ...OPEN }, SHARE, 'aaaaaaaaaaaaaaaaaaaa', null);
    expect(inside.kind).toBe('md');
    if (inside.kind === 'md') expect(inside.bundle).toBe(true);
    for (const id of ['bbbbbbbbbbbbbbbbbbbb', 'dddddddddddddddddddd', 'zzzzzzzzzzzzzzzzzzzz', '../x']) {
      expect((await resolveShareOpenWith({ ...deps, ...OPEN }, SHARE, id, null)).kind, id).toBe('not-found');
    }
  });

  it('없는 공유·꼴이 틀린 id·끈 공유·끝난 공유는 404', async () => {
    const scope = { kind: 'project', project: 'interview-lab' } as const;
    const cases: [string, ShareStoreDeps, string][] = [
      ['없음', store({}), SHARE],
      ['꼴', store({ [SHARE]: live(scope) }), 'short'],
      ['끔', store({ [SHARE]: { ...live(scope), revokedAtMs: NOW - 1 } }), SHARE],
      ['끝남', store({ [SHARE]: live(scope, NOW - 1) }), SHARE],
    ];
    for (const [name, deps, id] of cases) {
      expect((await resolveShareOpenWith({ ...deps, ...OPEN }, id, null, null)).kind, name).toBe('not-found');
    }
  });
});

describe('공유 만들기 createShareWith (J44·J53)', () => {
  it('문서 하나 7일: 기록을 만들고 주소·이름·끝나는 시각을 준다', async () => {
    const deps = store({});
    const view = await createShareWith(deps, { kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa' }, '7d', 'https://www.cruzlab.dev');
    expect(view).toMatchObject({ id: SHARE, url: `https://www.cruzlab.dev/s/${SHARE}`, label: '질문 1' });
    expect(view.expiresAt).toBe(new Date(NOW + 7 * DAY).toISOString());
    expect(deps.shares[SHARE]).toEqual({ scope: { kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa' }, expiresAtMs: NOW + 7 * DAY, revokedAtMs: null, createdAtMs: NOW });
  });

  it('끌 때까지: 끝나는 시각이 없다', async () => {
    const view = await createShareWith(store({}), { kind: 'project', project: 'interview-lab' }, 'forever', 'https://www.cruzlab.dev');
    expect(view.expiresAt).toBeNull();
    expect(view.remaining).toBe('끌 때까지');
  });

  it('없는 문서, 문서가 하나도 없는 프로젝트·폴더는 404', async () => {
    const deps = store({});
    await expect(createShareWith(deps, { kind: 'doc', docId: 'zzzzzzzzzzzzzzzzzzzz' }, '1d', 'https://x')).rejects.toMatchObject({ status: 404 });
    await expect(createShareWith(deps, { kind: 'project', project: 'nope' }, '1d', 'https://x')).rejects.toMatchObject({ status: 404 });
    await expect(
      createShareWith(deps, { kind: 'folder', project: 'interview-lab', folder: 'bund' }, '1d', 'https://x'),
    ).rejects.toMatchObject({ status: 404 });
    expect(Object.keys(deps.shares)).toEqual([]);
  });
});

describe('공유 중 목록·끄기·sharedBy', () => {
  const shares = () => ({
    [SHARE]: live({ kind: 'folder', project: 'interview-lab', folder: 'bundles' }, NOW + DAY),
    BBBBBBBBBBBBBBBBBBBBBBBB: live({ kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa' }),
    CCCCCCCCCCCCCCCCCCCCCCCC: { ...live({ kind: 'project', project: 'interview-lab' }), revokedAtMs: NOW - 1 },
    DDDDDDDDDDDDDDDDDDDDDDDD: live({ kind: 'project', project: 'cruz-lab' }, NOW - 1),
  });

  it('공유 중 목록은 살아 있는 것만, 최근 만든 것부터', async () => {
    const deps = store(shares());
    deps.shares.BBBBBBBBBBBBBBBBBBBBBBBB.createdAtMs = NOW - 10;
    const views = await listLiveSharesWith(deps, 'https://www.cruzlab.dev');
    expect(views.map((view) => view.id)).toEqual(['BBBBBBBBBBBBBBBBBBBBBBBB', SHARE]);
    expect(views.map((view) => view.label)).toEqual(['질문 1', 'interview-lab · bundles']);
    expect(views[1].remaining).toBe('1일 남음');
  });

  it('끄기: 끄는 시각만 적는다. 다시 꺼도 된다. 없는 공유는 거짓', async () => {
    const deps = store(shares());
    expect(await revokeShareWith(deps, SHARE)).toBe(true);
    expect(deps.shares[SHARE].revokedAtMs).toBe(NOW);
    expect(deps.shares[SHARE].scope).toEqual({ kind: 'folder', project: 'interview-lab', folder: 'bundles' });
    expect(await revokeShareWith(deps, SHARE)).toBe(true);
    expect(await revokeShareWith(deps, 'ZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false);
    expect(await revokeShareWith(deps, 'bad')).toBe(false);
  });

  it('sharedBy: 이 문서를 덮는 살아 있는 공유 (J52)', async () => {
    const deps = store(shares());
    expect(await sharesCoveringDocWith(deps, 'aaaaaaaaaaaaaaaaaaaa')).toEqual([
      { id: SHARE, kind: 'folder', label: 'interview-lab · bundles' },
      { id: 'BBBBBBBBBBBBBBBBBBBBBBBB', kind: 'doc', label: '질문 1' },
    ]);
    expect(await sharesCoveringDocWith(deps, 'dddddddddddddddddddd')).toEqual([]);
  });
});
