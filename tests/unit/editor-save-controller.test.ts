// 저장 컨트롤러 테스트 (재건 3단계 D1 b·D6, 리뷰 6.2 지적 1·2·5·6·7·8·13·17·19)
// - EditorApp이 쓰던 ref 흐름(dirty·halt·blockers·running)을 순수 클래스로 옮겼다. 전송·보관함·타이머는 가짜다.
import { describe, expect, it } from 'vitest';
import { docToMarkdown, markdownToDoc } from '@/editor/markdown';
import type { AutosaveEvent } from '@/editor/state/autosave';
import { ApiClientError, NetworkError } from '@/editor/state/api';
import type { DraftMeta } from '@/editor/state/change';
import type { OfflineDraft } from '@/editor/state/offline-store';
import {
  SaveController,
  type SaveBaseline,
  type SaveSnapshot,
} from '@/editor/state/save-controller';

const META: DraftMeta = {
  title: '제목',
  description: '',
  slug: '',
  category: null,
  tags: [],
  series: null,
  cover: { kind: 'generated' },
};

// 편집 모드 스냅샷: 에디터가 실제로 만드는 것과 같이 문서와 그 마크다운을 둔다
function editSnap(markdown: string, extra: Partial<SaveSnapshot> = {}): SaveSnapshot {
  const doc = markdownToDoc(markdown).doc;
  return {
    mode: 'edit',
    doc,
    markdown: docToMarkdown(doc),
    meta: META,
    blockers: 0,
    composing: false,
    ...extra,
  };
}

function sourceSnap(text: string, extra: Partial<SaveSnapshot> = {}): SaveSnapshot {
  return {
    mode: 'source',
    doc: null,
    markdown: text,
    meta: META,
    blockers: 0,
    composing: false,
    ...extra,
  };
}

// 열기 직후 기준: 서버 원문 raw, 편집 기준은 그 문서의 docToMarkdown
function baselineOf(raw: string, meta: DraftMeta = META): SaveBaseline {
  return { markdown: editSnap(raw).markdown, raw, meta };
}

type SaveBody = { baseVersion: number; device: string | null; draft: Record<string, unknown> };

function setup(options: { raw?: string; version?: number } = {}) {
  const raw = options.raw ?? '본문';
  const events: AutosaveEvent[] = [];
  const saves: SaveBody[] = [];
  const offlinePuts: OfflineDraft[] = [];
  let offlineDeletes = 0;
  let unauthorized = 0;
  const invalids: Record<string, string>[] = [];
  const timers: { fn: () => void; ms: number; cancelled: boolean }[] = [];
  let snapshot = editSnap(raw);
  let saveImpl: (body: SaveBody) => Promise<unknown> = async (body) => ({
    version: body.baseVersion + 1,
    updatedAt: '2026-11-09T01:00:00.000Z',
  });

  const controller = new SaveController(
    {
      entryId: 'e1',
      snapshot: () => snapshot,
      device: () => 'macbook',
      saveDraft: (body) => {
        saves.push(body as SaveBody);
        return saveImpl(body as SaveBody) as Promise<{ version: number; updatedAt: string }>;
      },
      putOffline: async (entry) => void offlinePuts.push(entry),
      deleteOffline: async () => void (offlineDeletes += 1),
      dispatch: (event) => void events.push(event),
      onInvalid: (issues) => void invalids.push(issues),
      onUnauthorized: () => void (unauthorized += 1),
      setTimer: (fn, ms) => timers.push({ fn, ms, cancelled: false }) - 1,
      clearTimer: (handle) => {
        const timer = timers[handle as number];
        if (timer) timer.cancelled = true;
      },
      now: () => '2026-11-09T01:00:00.000Z',
    },
    options.version ?? 3,
    baselineOf(raw),
  );

  // 걸려 있는 타이머를 하나씩 돌리고 저장이 끝날 때까지 기다린다
  async function fireTimers() {
    for (let guard = 0; guard < 10; guard += 1) {
      const pending = timers.filter((timer) => !timer.cancelled);
      if (pending.length === 0) return;
      for (const timer of pending) {
        timer.cancelled = true;
        timer.fn();
      }
      await controller.idle();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return {
    controller,
    events,
    saves,
    offlinePuts,
    get offlineDeletes() {
      return offlineDeletes;
    },
    get unauthorized() {
      return unauthorized;
    },
    invalids,
    timers,
    fireTimers,
    setSnapshot(next: SaveSnapshot) {
      snapshot = next;
    },
    setSaveImpl(next: typeof saveImpl) {
      saveImpl = next;
    },
  };
}

const conflictError = () =>
  new ApiClientError(409, 'DRAFT_CONFLICT', '다른 곳에서 초안이 먼저 바뀌었습니다.', {
    version: 7,
    device: 'iphone',
    updatedAt: '2026-11-09T00:59:00.000Z',
    draft: null,
  });

describe('SaveController: D1 b 고치지 않으면 쓰지 않음', () => {
  it('바뀐 것이 없으면 PUT을 보내지 않고 unchanged다', async () => {
    const env = setup();
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toEqual([]);
    expect(env.events.map((event) => event.type)).toContain('save-unchanged');
  });

  it('본문을 고치면 2초 뒤 baseVersion·device·editorJson v1과 함께 보낸다. 다시 돌면 unchanged다', async () => {
    const env = setup();
    env.setSnapshot(editSnap('본문 고침'));
    env.controller.markChanged();
    expect(env.timers.at(-1)?.ms).toBe(2000);
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
    expect(env.saves[0]).toMatchObject({ baseVersion: 3, device: 'macbook' });
    expect(env.saves[0].draft.markdown).toBe(editSnap('본문 고침').markdown);
    expect((env.saves[0].draft.editorJson as { v: number }).v).toBe(1);
    expect(env.controller.version).toBe(4);
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
  });

  it('메타만 바꿔도 보낸다', async () => {
    const env = setup();
    env.setSnapshot({ ...editSnap('본문'), meta: { ...META, description: '설명' } });
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
  });

  it('unchanged이면 오프라인 보관 칸을 지운다', async () => {
    const env = setup();
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.offlineDeletes).toBe(1);
  });
});

describe('SaveController: 소스 모드 (D8, 지적 17)', () => {
  it('소스 모드 저장은 editorJson null이고, 편집 기준을 모름으로 바꾼다', async () => {
    const env = setup();
    env.setSnapshot(sourceSnap('# 소스로 고침'));
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves[0].draft).toMatchObject({ markdown: '# 소스로 고침', editorJson: null });
    expect(env.controller.baseline.raw).toBe('# 소스로 고침');
    expect(env.controller.baseline.markdown).toBeNull();
  });

  it('저장된 소스 텍스트로 돌아오면 편집 기준을 다시 잡고 저장하지 않는다', async () => {
    const env = setup();
    env.setSnapshot(sourceSnap('# 소스로 고침'));
    env.controller.markChanged();
    await env.fireTimers();
    const back = editSnap('# 소스로 고침');
    env.setSnapshot(back);
    await env.controller.sourceExited('# 소스로 고침', back.markdown);
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
    expect(env.controller.baseline.markdown).toBe(back.markdown);
  });

  it('저장 중에 돌아와도 저장이 끝난 뒤 비교한다(두 번 저장하지 않는다)', async () => {
    const env = setup();
    let release: () => void = () => {};
    env.setSaveImpl(
      (body) =>
        new Promise((resolve) => {
          release = () => resolve({ version: body.baseVersion + 1, updatedAt: 'T' });
        }),
    );
    env.setSnapshot(sourceSnap('소스 원문 그대로'));
    env.controller.markChanged();
    env.timers.at(-1)!.cancelled = true;
    const saving = env.controller.runSave();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const back = editSnap('소스 원문 그대로');
    env.setSnapshot(back);
    const exited = env.controller.sourceExited('소스 원문 그대로', back.markdown);
    release();
    await saving;
    await exited;
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
  });

  it('저장하지 않은 소스 텍스트로 돌아오면 편집 모드로 저장한다', async () => {
    const env = setup();
    const back = editSnap('새 글자');
    env.setSnapshot(back);
    await env.controller.sourceExited('새 글자', back.markdown);
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
    expect((env.saves[0].draft.editorJson as { v: number } | null)?.v).toBe(1);
  });

  it('소스 모드에 들어갈 때: 편집 변경이 없으면 서버 원문, 있으면 변환 결과', () => {
    const env = setup({ raw: '* 별표 글머리' });
    const unchanged = editSnap('* 별표 글머리');
    expect(env.controller.sourceTextFor(unchanged.markdown)).toBe('* 별표 글머리');
    expect(env.controller.sourceTextFor('- 고친 글머리\n')).toBe('- 고친 글머리\n');
  });
});

describe('SaveController: 막는 조건 (지적 1·2·5·8)', () => {
  it('업로드 중(blockers > 0)이면 보내지 않고, flush는 blocked다', async () => {
    const env = setup();
    env.setSnapshot(editSnap('고침', { blockers: 1 }));
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toEqual([]);
    expect(await env.controller.flush()).toBe('blocked');
  });

  it('업로드가 끝나 blockers가 0이 되면 저장을 예약한다', async () => {
    const env = setup();
    env.setSnapshot(editSnap('고침', { blockers: 1 }));
    env.controller.setBlockers(1);
    env.controller.markChanged();
    await env.fireTimers();
    env.setSnapshot(editSnap('고침'));
    env.controller.setBlockers(0);
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
  });

  it('한글 조합 중이면 500ms 뒤로 미룬다', async () => {
    const env = setup();
    env.setSnapshot(editSnap('고침', { composing: true }));
    env.controller.markChanged();
    env.timers.at(-1)!.cancelled = true;
    expect(await env.controller.runSave()).toBe('skipped');
    expect(env.timers.at(-1)?.ms).toBe(500);
  });

  it('blob: 주소가 들어간 본문은 보내지 않는다(소스 모드·붙여넣은 이미지)', async () => {
    const env = setup();
    env.setSnapshot(sourceSnap('![x](blob:http://localhost:4322/abc)'));
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toEqual([]);
    expect(await env.controller.flush()).toBe('blocked');
  });

  it('서버가 400을 낼 메타는 보내지 않고 칸별 이유를 알린다. 고치면 다음 변경에서 보낸다', async () => {
    const env = setup();
    env.setSnapshot({
      ...editSnap('본문'),
      meta: { ...META, series: { key: 'Bad Key', order: 1 } },
    });
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toEqual([]);
    expect(Object.keys(env.invalids.at(-1) ?? {})).toEqual(['series']);
    expect(env.controller.halt).toBeNull();
    env.setSnapshot({
      ...editSnap('본문'),
      meta: { ...META, series: { key: 'good-key', order: 1 } },
    });
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
    expect(env.invalids.at(-1)).toEqual({});
  });

  it('Firestore 깊이 한도를 넘는 문서는 editorJson 없이 보낸다', async () => {
    const env = setup();
    env.setSnapshot(editSnap('- a\n  - b\n    - **c**'));
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
    expect(env.saves[0].draft.editorJson).toBeNull();
  });
});

describe('SaveController: 오류·충돌·오프라인 (D6, 지적 6·7·13·19)', () => {
  it('409는 conflict로 멈춘다. "내 것으로 덮기"는 내용이 기준과 같아도 서버 버전으로 반드시 보낸다', async () => {
    const env = setup();
    env.setSaveImpl(async () => {
      throw conflictError();
    });
    env.setSnapshot(editSnap('고침'));
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.controller.halt).toBe('conflict');
    expect(env.events.at(-1)).toMatchObject({ type: 'save-conflicted' });

    // 손으로 원래대로 되돌린 뒤 덮기
    env.setSnapshot(editSnap('본문'));
    env.setSaveImpl(async (body) => ({ version: body.baseVersion + 1, updatedAt: 'T' }));
    env.controller.keepLocal(7);
    await env.fireTimers();
    expect(env.saves.at(-1)).toMatchObject({ baseVersion: 7 });
    expect(env.saves.at(-1)?.draft.markdown).toBe(editSnap('본문').markdown);
    expect(env.controller.version).toBe(8);
  });

  it('"서버 것 열기"는 새 기준으로 깨끗한 상태가 되고 보관 칸을 지운다', async () => {
    const env = setup();
    env.controller.enterConflict({ version: 7, device: 'iphone', updatedAt: null, draft: null });
    env.controller.takeServer(7, baselineOf('서버 본문'));
    env.setSnapshot(editSnap('서버 본문'));
    expect(env.controller.halt).toBeNull();
    expect(env.controller.hasPending()).toBe(false);
    expect(env.offlineDeletes).toBe(1);
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toEqual([]);
  });

  it('네트워크 실패는 보관함에 두고 멈춘다. 그 뒤 입력도 2초 뒤 보관한다. 온라인이 되면 마지막 내용을 보낸다', async () => {
    const env = setup();
    env.setSaveImpl(async () => {
      throw new NetworkError(new TypeError('fetch failed'));
    });
    env.setSnapshot(editSnap('오프라인 1'));
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.controller.halt).toBe('offline');
    expect(env.offlinePuts.at(-1)?.draft.markdown).toBe(editSnap('오프라인 1').markdown);

    env.setSnapshot(editSnap('오프라인 2'));
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
    expect(env.offlinePuts.at(-1)?.draft.markdown).toBe(editSnap('오프라인 2').markdown);
    expect(env.offlinePuts.at(-1)?.baseVersion).toBe(3);

    env.setSaveImpl(async (body) => ({ version: body.baseVersion + 1, updatedAt: 'T' }));
    env.controller.resume('came-online');
    await env.fireTimers();
    expect(env.saves.at(-1)?.draft.markdown).toBe(editSnap('오프라인 2').markdown);
    expect(env.controller.halt).toBeNull();
    expect(env.offlineDeletes).toBeGreaterThan(0);
  });

  it('401은 보관함에 둔 뒤 로그인으로 보낸다. 떠날 때 경고하지 않는다', async () => {
    const env = setup();
    env.setSaveImpl(async () => {
      throw new ApiClientError(401, 'UNAUTHENTICATED', '관리자 로그인이 필요합니다.');
    });
    env.setSnapshot(editSnap('고침'));
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.offlinePuts).toHaveLength(1);
    expect(env.unauthorized).toBe(1);
    expect(env.controller.hasPending()).toBe(false);
  });

  it('400·413·5xx는 error로 멈추고 새 입력으로 저장하지 않는다. 재시도하면 보낸다', async () => {
    const env = setup();
    env.setSaveImpl(async () => {
      throw new ApiClientError(413, 'DRAFT_TOO_LARGE', '초안 값이 올바르지 않습니다.');
    });
    env.setSnapshot(editSnap('고침'));
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.controller.halt).toBe('error');
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.saves).toHaveLength(1);
    env.setSaveImpl(async (body) => ({ version: body.baseVersion + 1, updatedAt: 'T' }));
    env.controller.resume('retry');
    await env.fireTimers();
    expect(env.saves).toHaveLength(2);
    expect(await env.controller.flush()).toBe('unchanged');
  });

  it('200인데 version이 없는 응답이면 기준을 바꾸지 않고 error다', async () => {
    const env = setup();
    env.setSaveImpl(async () => null);
    env.setSnapshot(editSnap('고침'));
    env.controller.markChanged();
    await env.fireTimers();
    expect(env.controller.halt).toBe('error');
    expect(env.controller.baseline.markdown).toBe(editSnap('본문').markdown);
    expect(env.controller.version).toBe(3);
  });

  it('저장 중에 다시 바뀌면 끝난 뒤 한 번 더 보낸다', async () => {
    const env = setup();
    let release: () => void = () => {};
    env.setSaveImpl(
      (body) =>
        new Promise((resolve) => {
          release = () => resolve({ version: body.baseVersion + 1, updatedAt: 'T' });
        }),
    );
    env.setSnapshot(editSnap('첫 번째'));
    env.controller.markChanged();
    env.timers.at(-1)!.cancelled = true;
    const first = env.controller.runSave();
    await new Promise((resolve) => setTimeout(resolve, 10));
    env.setSnapshot(editSnap('두 번째'));
    env.controller.markChanged();
    env.setSaveImpl(async (body) => ({ version: body.baseVersion + 1, updatedAt: 'T' }));
    release();
    await first;
    await env.fireTimers();
    expect(env.saves.map((body) => body.draft.markdown)).toEqual([
      editSnap('첫 번째').markdown,
      editSnap('두 번째').markdown,
    ]);
  });

  it('flush: 깨끗하면 unchanged, 충돌이면 conflict, 고친 것이 있으면 저장한 뒤 saved', async () => {
    const env = setup();
    expect(await env.controller.flush()).toBe('unchanged');
    env.setSnapshot(editSnap('고침'));
    env.controller.markChanged();
    expect(await env.controller.flush()).toBe('saved');
    env.controller.enterConflict({ version: 9, device: null, updatedAt: null, draft: null });
    expect(await env.controller.flush()).toBe('conflict');
  });

  it('reset은 깨끗한 상태로 만들고 clearOffline이면 보관 칸을 지운다', () => {
    const env = setup();
    env.setSnapshot(editSnap('고침'));
    env.controller.markChanged();
    env.controller.reset(10, baselineOf('발행본'), { clearOffline: true });
    expect(env.controller.hasPending()).toBe(false);
    expect(env.controller.version).toBe(10);
    expect(env.offlineDeletes).toBe(1);
    expect(env.events.at(-1)).toEqual({ type: 'reset', version: 10 });
  });
});
