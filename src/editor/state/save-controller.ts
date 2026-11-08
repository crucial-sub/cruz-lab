// 저장 컨트롤러 (재건 3단계 D1 b·D6, 리뷰 6.2 지적 1·2·5·6·7·8·13·17·19)
// - 자동저장의 제어 흐름을 React 밖의 클래스로 둔다. 리듀서(autosave.ts)는 화면 표시용이고, 이 클래스가 실제 판단을 한다.
// - 상태: dirty(보낼 변경이 있을 수 있다), halt(멈춘 이유: error·offline·conflict), blockers(업로드 중 이미지 수),
//   running(진행 중인 저장), force(다음 저장은 비교 없이 보낸다), baseline(서버가 가진 내용).
// - 전송·보관함·타이머·스냅샷은 주입한다. 단위 테스트는 가짜를 넣는다.
//
// 변경 판정 기준(baseline):
// - markdown: 편집 모드 기준. 열기 직후(또는 편집 모드 저장 뒤) 문서의 docToMarkdown 결과다. null이면 모른다(소스 모드 저장 뒤).
// - raw: 서버가 가진 마크다운 원문. 소스 모드의 기준이고, 소스 모드에 들어갈 때 보이는 텍스트다.
// - meta: 서버가 가진 메타.

import type { JSONContent } from '@tiptap/core';
import type { DraftInput } from '@/lib/entry-rules';
import { ApiClientError } from './api';
import type { AutosaveEvent, ConflictInfo } from './autosave';
import {
  containsBlobUrl,
  editorJsonForSave,
  isSameMeta,
  validateDraftForSave,
  type DraftMeta,
} from './change';
import type { OfflineDraft } from './offline-store';

// 마지막 입력 뒤 저장까지 기다리는 시간 (D6)
export const SAVE_DEBOUNCE_MS = 2000;
// 한글 조합 중이면 다시 볼 때까지의 시간
const COMPOSING_RETRY_MS = 500;

export type SaveMode = 'edit' | 'source';
export type Halt = 'error' | 'offline' | 'conflict' | null;

// 저장 한 번(또는 flush)의 결과
// - blocked: 업로드 중 이미지나 blob 주소 때문에 보내지 않았다. invalid: 메타가 서버 규칙에 맞지 않는다
export type SaveOutcome =
  | 'saved'
  | 'unchanged'
  | 'skipped'
  | 'blocked'
  | 'invalid'
  | 'failed'
  | 'conflict'
  | 'offline';

// 지금 화면의 내용
export interface SaveSnapshot {
  mode: SaveMode;
  // 편집 모드 문서. 소스 모드면 null이다
  doc: JSONContent | null;
  // 편집 모드: docToMarkdown(doc). 소스 모드: textarea 텍스트
  markdown: string;
  meta: DraftMeta;
  // 업로드가 끝나지 않은 이미지 수(업로드 중, 실패, 복사한 blob 자리표시)
  blockers: number;
  // 한글 조합 중
  composing: boolean;
}

export interface SaveBaseline {
  markdown: string | null;
  raw: string;
  meta: DraftMeta;
}

export interface SaveControllerDeps {
  entryId: string;
  snapshot(): SaveSnapshot;
  device(): string | null;
  saveDraft(body: {
    baseVersion: number;
    device: string | null;
    draft: DraftInput;
  }): Promise<{ version: number; updatedAt: string }>;
  putOffline(entry: OfflineDraft): Promise<void>;
  deleteOffline(): Promise<void>;
  dispatch(event: AutosaveEvent): void;
  // 서버 규칙에 맞지 않는 칸. 맞으면 빈 객체로 다시 부른다
  onInvalid(issues: Record<string, string>): void;
  onUnauthorized(): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  now(): string;
}

// 409 응답의 details → 충돌 정보
export function conflictOf(error: ApiClientError): ConflictInfo {
  const details = (error.details ?? {}) as Partial<ConflictInfo>;
  return {
    version: typeof details.version === 'number' ? details.version : 0,
    device: typeof details.device === 'string' ? details.device : null,
    updatedAt: typeof details.updatedAt === 'string' ? details.updatedAt : null,
    draft: details.draft ?? null,
  };
}

// 오류를 사람이 읽을 문구로 바꾼다
export function messageOf(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 413) return '글이 너무 깁니다 (900 KB 한도).';
    const first = Array.isArray(error.details)
      ? (error.details[0] as { message?: string } | undefined)
      : undefined;
    return first?.message ? `${error.message} (${first.message})` : error.message;
  }
  return error instanceof Error ? error.message : '알 수 없는 오류가 났습니다.';
}

// 칸 이름(API field) → 화면 이름
const FIELD_LABELS: Record<string, string> = {
  title: '제목',
  description: '설명',
  slug: 'slug',
  category: '카테고리',
  tags: '태그',
  series: '연재',
  cover: '표지',
  markdown: '본문',
};

interface Payload {
  draft: DraftInput;
  apply: () => void;
}

export class SaveController {
  private readonly deps: SaveControllerDeps;
  private currentVersion: number;
  private base: SaveBaseline;
  private dirty = false;
  private haltReason: Halt = null;
  private blockerCount = 0;
  private running: Promise<SaveOutcome> | null = null;
  private stashing: Promise<void> | null = null;
  private timer: unknown = null;
  private force = false;
  private invalidShown = false;
  private leaving = false;

  constructor(deps: SaveControllerDeps, version: number, baseline: SaveBaseline) {
    this.deps = deps;
    this.currentVersion = version;
    this.base = baseline;
  }

  // 서버 초안 버전(다음 요청의 baseVersion)
  get version(): number {
    return this.currentVersion;
  }

  get baseline(): Readonly<SaveBaseline> {
    return this.base;
  }

  get halt(): Halt {
    return this.haltReason;
  }

  // 떠나면 잃는 것이 있는지(beforeunload)
  hasPending(): boolean {
    if (this.leaving) return false;
    return this.dirty || this.running !== null || this.blockerCount > 0;
  }

  // 진행 중인 저장과 보관이 끝날 때까지 기다린다
  async idle(): Promise<void> {
    if (this.running) await this.running;
    if (this.stashing) await this.stashing;
  }

  // 새 기준으로 깨끗하게 시작한다(열기, 초안 버리기 뒤)
  reset(version: number, baseline: SaveBaseline, options: { clearOffline?: boolean } = {}) {
    this.cancelTimer();
    this.currentVersion = version;
    this.base = baseline;
    this.dirty = false;
    this.haltReason = null;
    this.force = false;
    this.deps.dispatch({ type: 'reset', version });
    if (options.clearOffline) void this.deps.deleteOffline().catch(() => {});
  }

  // 업로드 중 이미지 수가 바뀌었다. 0이 되면 밀린 저장을 예약한다
  setBlockers(count: number) {
    if (count === this.blockerCount) return;
    this.blockerCount = count;
    this.deps.dispatch({ type: 'blockers-changed', count });
    if (count === 0 && this.dirty && !this.haltReason) this.schedule(SAVE_DEBOUNCE_MS);
  }

  // 내용이 바뀌었다
  // - 멈춘 상태가 아니면 2초 뒤 저장한다.
  // - 오프라인이면 2초 뒤 기기에 보관만 한다(전송은 온라인이 되면 한다, D6·지적 7).
  // - 오류·충돌이면 사용자가 고를 때까지 기다린다.
  markChanged() {
    this.dirty = true;
    this.deps.dispatch({ type: 'changed' });
    if (this.haltReason === 'offline') this.schedule(SAVE_DEBOUNCE_MS, () => this.stashNow());
    else if (!this.haltReason) this.schedule(SAVE_DEBOUNCE_MS);
  }

  // 소스 모드에 들어갈 때 보일 텍스트: 저장 안 된 편집 변경이 없으면 서버 원문, 있으면 변환 결과
  sourceTextFor(editMarkdown: string): string {
    return editMarkdown !== this.base.markdown ? editMarkdown : this.base.raw;
  }

  // 소스 모드에서 편집 모드로 돌아왔다. 스냅샷은 이미 편집 모드다
  // - 진행 중인 저장을 기다린 뒤 비교한다(저장 시점에 따라 두 번 저장하지 않게, 지적 17).
  // - 서버가 이 텍스트를 가지면 다시 만든 문서의 마크다운이 새 편집 기준이다. 아니면 편집 모드로 저장한다.
  async sourceExited(text: string, editMarkdown: string) {
    await this.idle();
    if (text === this.base.raw) {
      this.base = { ...this.base, markdown: editMarkdown };
      return;
    }
    this.markChanged();
  }

  // 멈춘 저장을 다시 시작한다(재시도 버튼, 온라인 복귀)
  resume(event: 'retry' | 'came-online') {
    this.haltReason = null;
    this.dirty = true;
    this.deps.dispatch({ type: event });
    this.schedule(0);
  }

  // 충돌 상태로 들어간다(발행·초안 버리기의 409, 보관함 복원 때 버전이 다름)
  enterConflict(conflict: ConflictInfo) {
    this.cancelTimer();
    this.haltReason = 'conflict';
    this.dirty = true;
    this.deps.dispatch({ type: 'save-conflicted', conflict });
  }

  // "내 것으로 덮기": 서버 버전을 받아 지금 내용을 비교 없이 보낸다(지적 6)
  keepLocal(version: number) {
    this.currentVersion = version;
    this.haltReason = null;
    this.dirty = true;
    this.force = true;
    this.deps.dispatch({ type: 'conflict-resolved', version, keepLocal: true });
    this.schedule(0);
  }

  // "서버 것 열기": 서버 초안이 새 기준이다. 보관 칸은 버린다
  takeServer(version: number, baseline: SaveBaseline) {
    this.cancelTimer();
    this.currentVersion = version;
    this.base = baseline;
    this.dirty = false;
    this.haltReason = null;
    this.force = false;
    this.deps.dispatch({ type: 'conflict-resolved', version, keepLocal: false });
    void this.deps.deleteOffline().catch(() => {});
  }

  // 지금 바로 저장을 끝낸다(발행 전). 보낼 수 없으면 그 이유를 돌려준다(지적 5)
  async flush(): Promise<SaveOutcome> {
    this.cancelTimer();
    await this.idle();
    if (this.haltReason === 'error') return 'failed';
    if (this.haltReason) return this.haltReason;
    if (!this.dirty) return 'unchanged';
    let outcome = await this.runSave();
    // 저장 중에 또 바뀌었으면 한 번 더 보낸다
    if (outcome === 'saved' && this.dirty && !this.haltReason) outcome = await this.runSave();
    if (this.dirty && (outcome === 'saved' || outcome === 'unchanged' || outcome === 'skipped')) {
      return 'blocked';
    }
    return outcome;
  }

  // 저장 한 번
  async runSave(): Promise<SaveOutcome> {
    if (this.running) return this.running;
    if (!this.dirty || this.haltReason) return 'skipped';
    const snapshot = this.deps.snapshot();
    if (snapshot.blockers > 0) return 'blocked';
    // 한글 조합 중에는 문서를 읽지 않는다(Plan 11절)
    if (snapshot.composing) {
      this.schedule(COMPOSING_RETRY_MS);
      return 'skipped';
    }

    const promise = this.save(snapshot);
    this.running = promise;
    try {
      return await promise;
    } finally {
      this.running = null;
    }
  }

  // 타이머를 모두 멈춘다(화면을 닫을 때, 초안 버리기 직전)
  dispose() {
    this.cancelTimer();
  }

  // 페이지를 떠난다(삭제·로그아웃 뒤). 타이머를 멈추고 떠날 때 경고하지 않는다
  leave() {
    this.cancelTimer();
    this.leaving = true;
  }

  // ───────────── 내부 ─────────────

  private async save(snapshot: SaveSnapshot): Promise<SaveOutcome> {
    this.dirty = false;
    let payload: Payload | null;
    try {
      payload = await this.buildPayload(snapshot, this.force);
    } catch (error) {
      this.dirty = true;
      this.haltReason = 'error';
      this.deps.dispatch({ type: 'save-failed', message: messageOf(error) });
      return 'failed';
    }
    if (!payload) {
      this.deps.dispatch({ type: 'save-unchanged' });
      void this.deps.deleteOffline().catch(() => {});
      return 'unchanged';
    }

    // 업로드가 끝나지 않은 이미지 주소는 서버에 보내지 않는다(지적 2). 고칠 때까지 기다린다
    if (containsBlobUrl(payload.draft.markdown)) {
      this.dirty = true;
      this.deps.dispatch({
        type: 'save-failed',
        message: '업로드가 끝나지 않은 이미지 주소(blob:)가 있어 저장하지 않습니다',
      });
      return 'blocked';
    }

    // 서버가 400을 낼 메타는 보내지 않는다(지적 8). 멈추지 않고 다음 변경에서 다시 본다
    const validation = validateDraftForSave(payload.draft);
    if (!validation.ok) {
      this.dirty = true;
      this.invalidShown = true;
      this.deps.onInvalid(validation.issues);
      const labels = Object.keys(validation.issues).map((field) => FIELD_LABELS[field] ?? field);
      this.deps.dispatch({
        type: 'save-failed',
        message: `입력 값을 확인하세요 (${labels.join(', ')})`,
      });
      return 'invalid';
    }
    if (this.invalidShown) {
      this.invalidShown = false;
      this.deps.onInvalid({});
    }

    this.deps.dispatch({ type: 'save-started' });
    let result: { version: number; updatedAt: string } | null;
    try {
      result = await this.deps.saveDraft({
        baseVersion: this.currentVersion,
        device: this.deps.device(),
        draft: payload.draft,
      });
    } catch (error) {
      return this.handleSaveError(error, payload.draft);
    }

    // 200이어도 응답이 이상하면(캡티브 포털 등) 기준을 바꾸지 않는다(지적 19)
    if (!result || typeof result.version !== 'number') {
      this.dirty = true;
      this.haltReason = 'error';
      this.deps.dispatch({ type: 'save-failed', message: '서버 응답이 올바르지 않습니다.' });
      return 'failed';
    }

    payload.apply();
    this.currentVersion = result.version;
    this.force = false;
    this.deps.dispatch({
      type: 'save-succeeded',
      version: result.version,
      updatedAt: result.updatedAt,
    });
    void this.deps.deleteOffline().catch(() => {});
    if (this.dirty) this.schedule(SAVE_DEBOUNCE_MS);
    return 'saved';
  }

  private async handleSaveError(error: unknown, draft: DraftInput): Promise<SaveOutcome> {
    this.dirty = true;
    if (error instanceof ApiClientError) {
      if (error.status === 409) {
        this.haltReason = 'conflict';
        this.deps.dispatch({ type: 'save-conflicted', conflict: conflictOf(error) });
        return 'conflict';
      }
      if (error.status === 401) {
        // 세션 만료: 기기에 두고 로그인으로 보낸다. 돌아오면 보관함 복원을 묻는다(지적 13)
        await this.stash(draft);
        this.haltReason = 'offline';
        this.dirty = false;
        this.leaving = true;
        this.deps.onUnauthorized();
        return 'failed';
      }
      this.haltReason = 'error';
      this.deps.dispatch({ type: 'save-failed', message: messageOf(error) });
      return 'failed';
    }
    // 서버에 닿지 못했다: 기기에 둔다
    await this.stash(draft);
    this.haltReason = 'offline';
    this.deps.dispatch({ type: 'stored-offline' });
    return 'offline';
  }

  // 지금 내용으로 저장 본문을 만든다. 기준과 같으면 null(D1 b). force면 비교하지 않는다
  private async buildPayload(snapshot: SaveSnapshot, force: boolean): Promise<Payload | null> {
    const meta = snapshot.meta;
    const metaChanged = !isSameMeta(meta, this.base.meta);

    if (snapshot.mode === 'source') {
      const text = snapshot.markdown;
      if (!force && text === this.base.raw && !metaChanged) return null;
      return {
        draft: { ...meta, markdown: text, editorJson: null },
        apply: () => {
          // 소스 텍스트의 편집 기준은 다시 파싱하기 전까지 모른다
          this.base = { markdown: null, raw: text, meta };
        },
      };
    }

    const markdown = snapshot.markdown;
    const sameBody = this.base.markdown !== null && markdown === this.base.markdown;
    if (!force && sameBody && !metaChanged) return null;
    const editorJson = snapshot.doc ? await editorJsonForSave(snapshot.doc, markdown) : null;
    return {
      draft: {
        ...meta,
        markdown,
        editorJson: editorJson as unknown as Record<string, unknown> | null,
      },
      apply: () => {
        this.base = { markdown, raw: markdown, meta };
      },
    };
  }

  // 오프라인 중 입력: 지금 내용을 기기에 보관한다(전송하지 않는다)
  private stashNow(): Promise<void> {
    const snapshot = this.deps.snapshot();
    const work = (async () => {
      try {
        const payload = await this.buildPayload(snapshot, true);
        if (payload) await this.stash(payload.draft);
      } catch (error) {
        console.error('[editor] 오프라인 보관 실패', error);
      }
    })();
    this.stashing = work;
    void work.finally(() => {
      if (this.stashing === work) this.stashing = null;
    });
    return work;
  }

  private async stash(draft: DraftInput) {
    try {
      await this.deps.putOffline({
        id: this.deps.entryId,
        baseVersion: this.currentVersion,
        draft,
        savedAt: this.deps.now(),
      });
    } catch (error) {
      console.error('[editor] 오프라인 보관 실패', error);
    }
  }

  // ms 뒤에 run(기본: 저장)을 한다. 이미 걸린 타이머는 미룬다(디바운스)
  private schedule(ms: number, run: () => unknown = () => this.runSave()) {
    this.cancelTimer();
    this.timer = this.deps.setTimer(() => {
      this.timer = null;
      void run();
    }, ms);
  }

  private cancelTimer() {
    if (this.timer !== null) {
      this.deps.clearTimer(this.timer);
      this.timer = null;
    }
  }
}
