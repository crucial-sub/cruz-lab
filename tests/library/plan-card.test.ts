// 서가 화면 계획 카드의 상태와 흐름 (폴더 2차 Plan T4, L12·L15, J62·J69·J71~J73)
// - 판정은 upload-plan.ts가 한다. 여기서는 카드의 상태, 경고 글, 취소·올리기 흐름을 본다.
// - DOM은 로컬 화면에서 확인한다(Plan 7.2).
import { describe, expect, it, vi } from 'vitest';
import { docIdForKey } from '@/library/ticket';
import {
  canSubmit,
  cardWarnings,
  decisionOf,
  findLegacyDocs,
  findReplacedDocs,
  initialCardState,
  runChoiceFlow,
  selectEntry,
  selectMode,
  sharedLabelsFor,
  summarizeUploads,
  toggleDoc,
  webDocId,
  type CardDecision,
} from '@/library/ui/plan-card';
import { planCollection, planDrop, type CollectionPlan } from '@/library/ui/upload-plan';

function setup(contents: Record<string, string>) {
  const picked = Object.entries(contents).map(([path, text]) => ({ path, bytes: text.length }));
  const plan = planDrop(picked);
  if (plan.ok || plan.error !== 'NEEDS_CHOICE') throw new Error('NEEDS_CHOICE가 아닙니다');
  const readText = async (source: string) => contents[source];
  return { choice: plan.choice, readText };
}

const BUNDLE = {
  'bundles/a.html': '<a href="b.html">b</a><img src="shared.png">',
  'bundles/a.md': '# a',
  'bundles/b.html': '<img src="shared.png">',
  'bundles/c.md': '# c',
  'bundles/shared.png': 'p',
  'bundles/unused.txt': 'u',
};

describe('카드 상태', () => {
  it('처음에는 문서 모음이고 모든 문서가 켜져 있다. 진입 파일은 첫 후보다 (L15)', () => {
    const { choice } = setup(BUNDLE);
    const state = initialCardState(choice);
    expect(state.mode).toBe('each');
    expect([...state.excluded]).toEqual([]);
    expect(state.entry).toBe('a.html');
  });

  it('파일을 놓았으면 진입 파일이 없다 (J72)', () => {
    const { choice } = setup({ 'a.md': '# a', 'b.md': '# b' });
    expect(initialCardState(choice).entry).toBeNull();
  });

  it('체크 칸을 끄고 다시 켠다. 앞 상태를 바꾸지 않는다', () => {
    const { choice } = setup(BUNDLE);
    const start = initialCardState(choice);
    const off = toggleDoc(start, 'b');
    expect([...off.excluded]).toEqual(['b']);
    expect([...start.excluded]).toEqual([]);
    expect([...toggleDoc(off, 'b').excluded]).toEqual([]);
  });

  it('방식과 진입 파일을 바꾼다', () => {
    const { choice } = setup(BUNDLE);
    const state = selectEntry(selectMode(initialCardState(choice), 'entry'), 'c.md');
    expect(decisionOf(state)).toEqual({ mode: 'entry', entry: 'c.md' });
  });

  it('문서 모음의 결정은 끈 문서를 담는다', () => {
    const { choice } = setup(BUNDLE);
    expect(decisionOf(toggleDoc(initialCardState(choice), 'c'))).toEqual({ mode: 'each', exclude: new Set(['c']) });
  });
});

describe('canSubmit', () => {
  const collectionWith = (patch: Partial<CollectionPlan>) =>
    ({ docs: [{ name: 'a' }], limitError: null, ...patch }) as CollectionPlan;

  it('문서가 하나라도 켜져 있고 한도 안이면 올릴 수 있다', () => {
    const { choice } = setup(BUNDLE);
    expect(canSubmit(initialCardState(choice), collectionWith({}))).toBe(true);
  });

  it('모두 끄면 올리지 못한다', () => {
    const { choice } = setup(BUNDLE);
    expect(canSubmit(initialCardState(choice), collectionWith({ docs: [] }))).toBe(false);
  });

  it('한도를 넘으면 올리지 못한다', () => {
    const { choice } = setup(BUNDLE);
    expect(canSubmit(initialCardState(choice), collectionWith({ limitError: 'TOO_MANY_DOCS' }))).toBe(false);
  });

  it('문서 하나는 문서 모음 한도와 상관없다. 진입 파일이 있으면 된다', () => {
    const { choice } = setup(BUNDLE);
    const state = selectMode(initialCardState(choice), 'entry');
    expect(canSubmit(state, collectionWith({ limitError: 'TOO_MANY_DOCS' }))).toBe(true);
  });
});

describe('webDocId', () => {
  it('서버의 docIdForKey와 같다 (NFC로 맞춘다)', async () => {
    const key = 'web:프로젝트/문서'.normalize('NFD');
    expect(await webDocId(key)).toBe(docIdForKey(key));
  });
});

describe('findLegacyDocs: 폴더 없이 올린 같은 이름의 문서 (J62)', () => {
  it('옛 키의 문서 id가 서가에 있으면 그 문서 이름을 돌려준다', async () => {
    const { choice } = setup(BUNDLE);
    const existing = new Set([docIdForKey('web:p/a'), docIdForKey('web:p/bundles/c'), docIdForKey('web:other/b')]);
    expect(await findLegacyDocs(choice, 'p', existing)).toEqual(['a']);
  });

  it('파일을 놓았으면 키가 같으므로 옛 문서가 아니다', async () => {
    const { choice } = setup({ 'a.md': '# a', 'b.md': '# b' });
    expect(await findLegacyDocs(choice, 'p', new Set([docIdForKey('web:p/a')]))).toEqual([]);
  });
});

describe('findReplacedDocs: 이미 서가에 있는 같은 키 (리뷰 I4)', () => {
  it('문서 모음과 문서 하나의 키가 서가에 있는지 본다', async () => {
    const { choice } = setup(BUNDLE);
    const existing = new Set([docIdForKey('web:p/bundles/a'), docIdForKey('web:p/bundles')]);
    expect(await findReplacedDocs(choice, 'p', existing)).toEqual({ names: ['a'], folderDoc: true });
  });

  it('파일을 놓으면 폴더 문서가 없다', async () => {
    const { choice } = setup({ 'a.md': '# a', 'b.md': '# b' });
    expect(await findReplacedDocs(choice, 'p', new Set([docIdForKey('web:p/b')]))).toEqual({ names: ['b'], folderDoc: false });
  });

  it('카드가 끈 문서를 빼고 바뀌는 수를 알린다', async () => {
    const { choice, readText } = setup(BUNDLE);
    const collection = await planCollection(choice, readText);
    const replaced = { names: ['a', 'c'], folderDoc: true };
    const state = toggleDoc(initialCardState(choice), 'c');
    const each = cardWarnings({ choice, state, collection, legacy: [], shared: [], replaced }).join('\n');
    expect(each).toContain('이미 서가에 있는 문서 1편은 새 판으로 바뀝니다.');
    const entry = cardWarnings({ choice, state: selectMode(state, 'entry'), collection, legacy: [], shared: [], replaced }).join('\n');
    expect(entry).toContain('이미 서가에 있는 이 폴더 문서가 새 판으로 바뀝니다.');
  });
});

describe('sharedLabelsFor: 올리기 전 공유 경고 (J71)', () => {
  const shares = [
    { scope: { kind: 'project', project: 'other' }, label: 'other' },
    { scope: { kind: 'folder', project: 'p', folder: 'bundles' }, label: 'p · bundles' },
  ] as const;

  it('문서 모음: 폴더 공유가 덮으면 경고한다', async () => {
    const { choice } = setup(BUNDLE);
    expect(await sharedLabelsFor(choice, 'p', initialCardState(choice), [...shares])).toEqual(['p · bundles']);
  });

  it('다른 프로젝트면 경고하지 않는다', async () => {
    const { choice } = setup(BUNDLE);
    expect(await sharedLabelsFor(choice, 'q', initialCardState(choice), [...shares])).toEqual([]);
  });

  it('문서 공유는 문서 id로 본다. 끈 문서는 보지 않는다', async () => {
    const { choice } = setup(BUNDLE);
    const docShare = [{ scope: { kind: 'doc', docId: docIdForKey('web:p/bundles/c') }, label: '문서 c' }] as const;
    const state = initialCardState(choice);
    expect(await sharedLabelsFor(choice, 'p', state, [...docShare])).toEqual(['문서 c']);
    expect(await sharedLabelsFor(choice, 'p', toggleDoc(state, 'c'), [...docShare])).toEqual([]);
  });

  it('문서 하나: 폴더 키의 문서는 그 폴더 공유에 들지 않는다. 프로젝트 공유에는 든다', async () => {
    const { choice } = setup(BUNDLE);
    const state = selectMode(initialCardState(choice), 'entry');
    expect(await sharedLabelsFor(choice, 'p', state, [...shares])).toEqual([]);
    const project = [{ scope: { kind: 'project', project: 'p' }, label: 'p' }] as const;
    expect(await sharedLabelsFor(choice, 'p', state, [...project])).toEqual(['p']);
  });
});

describe('cardWarnings: 카드의 경고 글 (J69·J70)', () => {
  async function warnings(contents: Record<string, string>, extra: Partial<Parameters<typeof cardWarnings>[0]> = {}) {
    const { choice, readText } = setup(contents);
    const collection = await planCollection(choice, readText);
    return cardWarnings({ choice, state: initialCardState(choice), collection, legacy: [], shared: [], ...extra });
  }

  it('HTML 사이 링크 수를 알린다', async () => {
    expect((await warnings(BUNDLE)).join('\n')).toContain('HTML에서 다른 문서로 가는 링크 1개는 서가에서 열리지 않습니다.');
  });

  it('안 올리는 파일을 이름과 함께 알린다', async () => {
    expect((await warnings(BUNDLE)).join('\n')).toContain('안 올리는 파일 1개: unused.txt');
  });

  it('x.src.html과 하위 폴더 문서를 알린다', async () => {
    const text = (
      await warnings({ 'x/a.html': '<p>a</p>', 'x/a.src.html': '<p>s</p>', 'x/b.md': '# b', 'x/sub/c.md': '# c' })
    ).join('\n');
    expect(text).toContain('.src.html·.phone.md 사본 1개는 올리지 않습니다.');
    expect(text).toContain('하위 폴더 문서 1개는 올리지 않습니다.');
  });

  it('빠진 자산을 문서 이름과 함께 알린다', async () => {
    const text = (await warnings({ 'x/a.html': '<img src="none.png">', 'x/b.md': '# b' })).join('\n');
    expect(text).toContain('a: none.png');
  });

  it('옛 문서와 공유 범위를 알린다', async () => {
    const text = (await warnings(BUNDLE, { legacy: ['a', 'c'], shared: ['p · bundles'] })).join('\n');
    expect(text).toContain('폴더 없이 올린 같은 이름의 문서 2편이 서가에 남습니다.');
    expect(text).toContain("공유 중인 'p · bundles'에 들어갑니다.");
  });

  it('한도를 넘으면 그 이유를 맨 앞에 보인다', async () => {
    const { choice, readText } = setup(BUNDLE);
    const collection = { ...(await planCollection(choice, readText)), limitError: 'TOO_MANY_FILES' as const };
    const list = cardWarnings({ choice, state: initialCardState(choice), collection, legacy: [], shared: [] });
    expect(list[0]).toContain('500개');
  });

  it('문서 하나: 짝이 없는 진입 파일이면 앞 판의 다른 형식이 남는다고 알린다 (위험 5)', async () => {
    const { choice, readText } = setup(BUNDLE);
    const collection = await planCollection(choice, readText);
    const state = selectEntry(selectMode(initialCardState(choice), 'entry'), 'c.md');
    const list = cardWarnings({ choice, state, collection, legacy: [], shared: [] });
    expect(list.join('\n')).toContain('앞서 올린 다른 형식이 있으면 그대로 남습니다');
    expect(list.join('\n')).not.toContain('HTML에서 다른 문서로');
  });

  it('문서 하나: 진입 경로와 겹쳐 뺀 파일을 알린다', async () => {
    const { choice, readText } = setup({ 'x/index.md': '# i', 'x/a.md': '# a' });
    const collection = await planCollection(choice, readText);
    const state = selectEntry(selectMode(initialCardState(choice), 'entry'), 'a.md');
    expect(cardWarnings({ choice, state, collection, legacy: [], shared: [] }).join('\n')).toContain('뺀 파일: index.md');
  });
});

describe('runChoiceFlow: 취소와 올리기 (C23)', () => {
  function deps(answer: CardDecision | null) {
    return {
      ask: vi.fn(async () => answer),
      uploadEach: vi.fn(async () => {}),
      uploadEntry: vi.fn(async () => {}),
    };
  }

  it('취소하면 올리기를 부르지 않는다', async () => {
    const { choice, readText } = setup(BUNDLE);
    const flow = deps(null);
    expect(await runChoiceFlow(choice, readText, flow)).toBe('cancelled');
    expect(flow.uploadEach).not.toHaveBeenCalled();
    expect(flow.uploadEntry).not.toHaveBeenCalled();
  });

  it('문서 모음: 끈 문서를 빼고 다시 계획해서 올린다', async () => {
    const { choice, readText } = setup(BUNDLE);
    const flow = deps({ mode: 'each', exclude: new Set(['b']) });
    expect(await runChoiceFlow(choice, readText, flow)).toBe('each');
    const plan = (flow.uploadEach.mock.calls[0] as unknown as [CollectionPlan])[0];
    expect(plan.docs.map((doc) => doc.name)).toEqual(['a', 'c']);
    expect(flow.uploadEntry).not.toHaveBeenCalled();
  });

  it('문서 모음: 모두 끈 결정이면 올리지 않는다', async () => {
    const { choice, readText } = setup(BUNDLE);
    const flow = deps({ mode: 'each', exclude: new Set(['a', 'b', 'c']) });
    expect(await runChoiceFlow(choice, readText, flow)).toBe('cancelled');
    expect(flow.uploadEach).not.toHaveBeenCalled();
  });

  it('문서 하나: 고른 진입 파일로 작업을 만든다', async () => {
    const { choice, readText } = setup(BUNDLE);
    const flow = deps({ mode: 'entry', entry: 'c.md' });
    expect(await runChoiceFlow(choice, readText, flow)).toBe('entry');
    const [jobs] = flow.uploadEntry.mock.calls[0] as unknown as [{ relativePath: string }[]];
    expect(jobs[0].relativePath).toBe('bundles.md');
    expect(flow.uploadEach).not.toHaveBeenCalled();
  });

  it('ask에 지금 계획과 다시 계획하는 함수를 준다', async () => {
    const { choice, readText } = setup(BUNDLE);
    const flow = deps(null);
    await runChoiceFlow(choice, readText, flow);
    const [collection, recompute] = flow.ask.mock.calls[0] as unknown as [
      CollectionPlan,
      (exclude: ReadonlySet<string>) => Promise<CollectionPlan>,
    ];
    expect(collection.docs).toHaveLength(3);
    expect((await recompute(new Set(['a']))).docs).toHaveLength(2);
  });
});

describe('summarizeUploads: 문서 모음 결과 (J73)', () => {
  const doc = (id: string) => ({ id, title: `제목 ${id}`, url: `https://x/${id}` });

  it('문서마다 한 줄로 모은다. 짝은 한 줄이다', () => {
    const summary = summarizeUploads([
      { name: 'a', doc: doc('1') },
      { name: 'a', doc: doc('1') },
      { name: 'b', doc: doc('2') },
    ]);
    expect(summary).toMatchObject({ uploaded: 2, failed: 0 });
    expect(summary.rows.map((row) => row.name)).toEqual(['a', 'b']);
    expect(summary.rows[0]).toMatchObject({ title: '제목 1', docId: '1', error: null });
  });

  it('한 작업이라도 실패하면 그 문서는 실패다. 이유를 보인다', () => {
    const summary = summarizeUploads([
      { name: 'a', doc: doc('1') },
      { name: 'a', error: '폰 판이 있습니다' },
      { name: 'b', error: '네트워크' },
    ]);
    expect(summary).toMatchObject({ uploaded: 0, failed: 2 });
    expect(summary.rows[0]).toMatchObject({ title: '제목 1', docId: '1', error: '폰 판이 있습니다' });
    expect(summary.rows[1]).toMatchObject({ title: 'b', docId: null, error: '네트워크' });
  });

  it('공유 경고 줄을 중복 없이 모은다', () => {
    const sharedBy = [{ id: 'AbCdEfGhIjKlMnOpQrStUv_-', kind: 'folder', label: 'p · x' }];
    const summary = summarizeUploads([
      { name: 'a', doc: doc('1'), sharedBy },
      { name: 'a', doc: doc('1'), sharedBy },
    ]);
    expect(summary.rows[0].warnings).toHaveLength(1);
  });
});

