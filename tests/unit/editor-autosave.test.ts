// 자동저장 상태 기계 테스트 (재건 3단계 D6)
import { describe, expect, it } from 'vitest';
import {
  autosaveReducer,
  canSaveNow,
  describeSaveStatus,
  initialAutosaveState,
  type AutosaveState,
} from '@/editor/state/autosave';

const conflict = {
  version: 5,
  device: 'iphone',
  updatedAt: '2026-11-09T01:00:00.000Z',
  draft: null,
};

function run(events: Parameters<typeof autosaveReducer>[1][], start = initialAutosaveState(3)) {
  return events.reduce((state, event) => autosaveReducer(state, event), start);
}

describe('autosaveReducer', () => {
  it('처음 상태는 idle이고 서버 버전을 기억한다', () => {
    const state = initialAutosaveState(3);
    expect(state.status).toBe('idle');
    expect(state.version).toBe(3);
    expect(canSaveNow(state)).toBe(false);
  });

  it('바뀌면 dirty가 되고 저장할 수 있다', () => {
    const state = run([{ type: 'changed' }]);
    expect(state.status).toBe('dirty');
    expect(canSaveNow(state)).toBe(true);
  });

  it('저장 성공은 버전과 시각을 갱신하고 saved가 된다', () => {
    const state = run([
      { type: 'changed' },
      { type: 'save-started' },
      { type: 'save-succeeded', version: 4, updatedAt: '2026-11-09T01:00:00.000Z' },
    ]);
    expect(state.status).toBe('saved');
    expect(state.version).toBe(4);
    expect(state.savedAt).toBe('2026-11-09T01:00:00.000Z');
  });

  it('저장 중에 다시 바뀌면 저장이 끝난 뒤 dirty로 돌아간다', () => {
    const state = run([
      { type: 'changed' },
      { type: 'save-started' },
      { type: 'changed' },
      { type: 'save-succeeded', version: 4, updatedAt: '2026-11-09T01:00:00.000Z' },
    ]);
    expect(state.status).toBe('dirty');
    expect(state.version).toBe(4);
  });

  it('저장 중에는 다시 저장하지 않는다', () => {
    const state = run([{ type: 'changed' }, { type: 'save-started' }, { type: 'changed' }]);
    expect(state.status).toBe('saving');
    expect(canSaveNow(state)).toBe(false);
  });

  it('타이머가 돌았는데 실제 변경이 없으면 이전의 깨끗한 상태로 돌아간다', () => {
    expect(run([{ type: 'changed' }, { type: 'save-unchanged' }]).status).toBe('idle');
    const saved = run([
      { type: 'changed' },
      { type: 'save-started' },
      { type: 'save-succeeded', version: 4, updatedAt: '2026-11-09T01:00:00.000Z' },
    ]);
    expect(run([{ type: 'changed' }, { type: 'save-unchanged' }], saved).status).toBe('saved');
  });

  it('409는 conflict 상태가 되고 서버 정보를 담는다. 저장하지 않는다', () => {
    const state = run([
      { type: 'changed' },
      { type: 'save-started' },
      { type: 'save-conflicted', conflict },
    ]);
    expect(state.status).toBe('conflict');
    expect(state.conflict).toEqual(conflict);
    expect(canSaveNow(state)).toBe(false);
    // 충돌 중 입력이 더 들어와도 충돌 화면을 유지한다
    expect(autosaveReducer(state, { type: 'changed' }).status).toBe('conflict');
  });

  it('"내 것으로 덮기"는 서버 버전을 받아 다시 dirty가 된다', () => {
    const state = run([
      { type: 'changed' },
      { type: 'save-started' },
      { type: 'save-conflicted', conflict },
      { type: 'conflict-resolved', version: 5, keepLocal: true },
    ]);
    expect(state.status).toBe('dirty');
    expect(state.version).toBe(5);
    expect(state.conflict).toBeNull();
    expect(canSaveNow(state)).toBe(true);
  });

  it('"서버 것 열기"는 깨끗한 상태로 돌아간다', () => {
    const state = run([
      { type: 'changed' },
      { type: 'save-started' },
      { type: 'save-conflicted', conflict },
      { type: 'conflict-resolved', version: 5, keepLocal: false },
    ]);
    expect(state.status).toBe('idle');
    expect(state.version).toBe(5);
    expect(state.conflict).toBeNull();
  });

  it('실패는 error 상태다. 자동으로 다시 저장하지 않고, retry로 dirty가 된다', () => {
    const failed = run([
      { type: 'changed' },
      { type: 'save-started' },
      { type: 'save-failed', message: '너무 깁니다' },
    ]);
    expect(failed.status).toBe('error');
    expect(failed.error).toBe('너무 깁니다');
    expect(canSaveNow(failed)).toBe(false);
    const retried = autosaveReducer(failed, { type: 'retry' });
    expect(retried.status).toBe('dirty');
    expect(retried.error).toBeNull();
  });

  it('오프라인 보관은 offline 상태고, 온라인 복귀 때 dirty로 돌아가 전송한다', () => {
    const offline = run([{ type: 'changed' }, { type: 'stored-offline' }]);
    expect(offline.status).toBe('offline');
    expect(canSaveNow(offline)).toBe(false);
    const online = autosaveReducer(offline, { type: 'came-online' });
    expect(online.status).toBe('dirty');
    expect(canSaveNow(online)).toBe(true);
  });

  it('깨끗한 상태에서 온라인 복귀는 상태를 바꾸지 않는다', () => {
    const state = run([{ type: 'came-online' }]);
    expect(state.status).toBe('idle');
  });

  it('업로드 같은 차단 요인이 있으면 dirty라도 저장하지 않는다', () => {
    const blocked = run([{ type: 'changed' }, { type: 'blockers-changed', count: 2 }]);
    expect(blocked.status).toBe('dirty');
    expect(canSaveNow(blocked)).toBe(false);
    expect(canSaveNow(autosaveReducer(blocked, { type: 'blockers-changed', count: 0 }))).toBe(true);
  });

  it('reset은 새 버전으로 깨끗한 상태를 만든다', () => {
    const state = run([
      { type: 'changed' },
      { type: 'save-started' },
      { type: 'save-failed', message: 'x' },
      { type: 'reset', version: 9 },
    ]);
    expect(state).toMatchObject({
      status: 'idle',
      version: 9,
      error: null,
      conflict: null,
      changedWhileSaving: false,
    });
  });
});

describe('autosaveReducer (리뷰 6.2 지적 14·테스트 빈틈)', () => {
  it('이미 dirty면 changed는 같은 객체를 돌려준다(키 입력마다 다시 그리지 않는다)', () => {
    const dirty = run([{ type: 'changed' }]);
    expect(autosaveReducer(dirty, { type: 'changed' })).toBe(dirty);
    const changedWhileSaving = run([
      { type: 'changed' },
      { type: 'save-started' },
      { type: 'changed' },
    ]);
    expect(autosaveReducer(changedWhileSaving, { type: 'changed' })).toBe(changedWhileSaving);
  });

  it('충돌·오프라인·오류 상태에서 changed는 상태를 바꾸지 않는다', () => {
    for (const state of [
      run([{ type: 'changed' }, { type: 'save-started' }, { type: 'save-conflicted', conflict }]),
      run([{ type: 'changed' }, { type: 'stored-offline' }]),
      run([{ type: 'changed' }, { type: 'save-started' }, { type: 'save-failed', message: 'x' }]),
    ]) {
      expect(autosaveReducer(state, { type: 'changed' })).toBe(state);
    }
  });

  it('save-started는 changedWhileSaving을 지운다', () => {
    const state = run([
      { type: 'changed' },
      { type: 'save-started' },
      { type: 'changed' },
      { type: 'save-started' },
    ]);
    expect(state.changedWhileSaving).toBe(false);
  });

  it('blockers-changed는 값이 같으면 같은 객체를 돌려준다', () => {
    const state = run([{ type: 'blockers-changed', count: 1 }]);
    expect(autosaveReducer(state, { type: 'blockers-changed', count: 1 })).toBe(state);
  });
});

describe('describeSaveStatus', () => {
  const now = new Date('2026-11-09T01:00:30.000Z');
  const base: AutosaveState = initialAutosaveState(1);

  it('저장됨은 상대 시각과 기기 이름을 보인다', () => {
    const state: AutosaveState = { ...base, status: 'saved', savedAt: '2026-11-09T01:00:00.000Z' };
    expect(describeSaveStatus(state, { device: 'macbook', now })).toBe('저장됨 · 방금 · macbook');
    const older = { ...state, savedAt: '2026-11-09T00:55:00.000Z' };
    expect(describeSaveStatus(older, { device: 'macbook', now })).toBe('저장됨 · 5분 전 · macbook');
  });

  it('상태별 문구', () => {
    expect(describeSaveStatus({ ...base, status: 'saving' }, { device: 'd', now })).toBe('저장 중');
    expect(describeSaveStatus({ ...base, status: 'offline' }, { device: 'd', now })).toBe(
      '오프라인 · 기기에 보관됨',
    );
    expect(
      describeSaveStatus({ ...base, status: 'error', error: '413' }, { device: 'd', now }),
    ).toBe('저장 실패 · 413');
    expect(describeSaveStatus({ ...base, status: 'dirty' }, { device: 'd', now })).toBe('변경됨');
    expect(
      describeSaveStatus({ ...base, status: 'dirty', blockers: 1 }, { device: 'd', now }),
    ).toBe('업로드가 끝나지 않은 이미지가 있어 저장 대기');
    expect(describeSaveStatus({ ...base, status: 'conflict' }, { device: 'd', now })).toBe(
      '충돌 · 다른 기기가 먼저 저장함',
    );
    expect(describeSaveStatus(base, { device: 'd', now })).toBe('');
  });
});
