// 되돌리기 판정 (서가 2단계 T5, Plan J39·J40)
// - decidePull: 맥 원본의 지금 상태, 서가가 아는 원본 해시(macSha256), 폰 판 해시로 ①~④를 정한다.
// - mdSyncFor…: 문서 기록의 되돌리기 상태(mdSync)를 언제 어떻게 바꾸는지. 1단계 문서(칸 없음)도 다룬다.
// - diffPreview: ③ 충돌 때 보이는 차이 앞부분. phoneCopyPath: ③ 때 원본 옆에 두는 파일 이름.
import { describe, expect, it } from 'vitest';
import {
  checkPulledReport,
  decidePull,
  diffPreview,
  hasPendingPull,
  phoneEditBlocksUpload,
  mdSyncAfterPull,
  mdSyncForPhoneSave,
  mdSyncForUpload,
  phoneCopyPath,
} from '@/library/sync';

const MAC = 'a'.repeat(64); // 맥 원본에 있다고 아는 md의 해시
const PHONE = 'b'.repeat(64); // 폰 판 md의 해시
const OTHER = 'c'.repeat(64); // 맥에서 따로 고친 원본의 해시
const SOURCE = '~/projects/p/docs/a.md';

describe('decidePull: 되돌리기 판정 ①~④ (J40)', () => {
  it('① 원본 해시가 서가가 아는 해시와 같으면 원본을 폰 판으로 바꾼다', () => {
    expect(decidePull({ sourcePath: SOURCE, local: { kind: 'file', sha256: MAC }, macSha256: MAC, phoneSha256: PHONE })).toEqual({
      kind: 'replace',
    });
  });

  it('② 원본이 이미 폰 판과 같으면 알림만 한다', () => {
    expect(decidePull({ sourcePath: SOURCE, local: { kind: 'file', sha256: PHONE }, macSha256: MAC, phoneSha256: PHONE })).toEqual({
      kind: 'same',
    });
  });

  it('② 서가가 원본 해시를 몰라도 원본이 폰 판과 같으면 알림만 한다', () => {
    expect(decidePull({ sourcePath: SOURCE, local: { kind: 'file', sha256: PHONE }, macSha256: null, phoneSha256: PHONE })).toEqual({
      kind: 'same',
    });
  });

  it('③ 원본도 바뀌었으면 덮어쓰지 않는다 (둘 다 고침)', () => {
    expect(decidePull({ sourcePath: SOURCE, local: { kind: 'file', sha256: OTHER }, macSha256: MAC, phoneSha256: PHONE })).toEqual({
      kind: 'conflict',
      reason: 'both-changed',
    });
  });

  it('③ 서가가 원본 해시를 모르면(macSha256 없음) 덮어쓰지 않는다', () => {
    expect(decidePull({ sourcePath: SOURCE, local: { kind: 'file', sha256: MAC }, macSha256: null, phoneSha256: PHONE })).toEqual({
      kind: 'conflict',
      reason: 'unknown-base',
    });
  });

  it('④ 원본 파일이 없으면 건너뛴다', () => {
    expect(decidePull({ sourcePath: SOURCE, local: { kind: 'missing' }, macSha256: MAC, phoneSha256: PHONE })).toEqual({
      kind: 'skip',
      reason: 'missing',
    });
  });

  it('④ 폴더째 문서(원본이 폴더)면 건너뛴다', () => {
    expect(decidePull({ sourcePath: SOURCE, local: { kind: 'dir' }, macSha256: MAC, phoneSha256: PHONE })).toEqual({
      kind: 'skip',
      reason: 'folder',
    });
  });

  it('④ 서가 화면으로 올린 문서(원본 경로 없음)면 건너뛴다', () => {
    expect(decidePull({ sourcePath: null, local: { kind: 'missing' }, macSha256: null, phoneSha256: PHONE })).toEqual({
      kind: 'skip',
      reason: 'no-source',
    });
  });
});

describe('mdSync: 되돌리기 상태 (J39)', () => {
  it('맥 올리기 마무리: 그 판의 index.md 해시가 원본 해시가 되고, 폰 판은 없다', () => {
    expect(mdSyncForUpload('mac', MAC)).toEqual({ macSha256: MAC, pendingRev: null });
  });

  it('서가 화면 올리기 마무리: 맥 원본이 없으므로 원본 해시는 null, 폰 판은 없다', () => {
    expect(mdSyncForUpload('web', MAC)).toEqual({ macSha256: null, pendingRev: null });
  });

  it('폰 저장: 이미 있는 원본 해시는 그대로 두고 폰 판 번호를 적는다', () => {
    expect(mdSyncForPhoneSave({ macSha256: MAC, pendingRev: 3 }, { origin: 'phone', entrySha256: PHONE }, 5)).toEqual({
      macSha256: MAC,
      pendingRev: 5,
    });
  });

  it('폰 저장, 1단계 문서(칸 없음)이고 앞 판이 맥 판: 앞 판 index.md 해시로 채운다', () => {
    expect(mdSyncForPhoneSave(undefined, { origin: 'mac', entrySha256: MAC }, 2)).toEqual({ macSha256: MAC, pendingRev: 2 });
  });

  it('폰 저장, 1단계 문서(칸 없음)이고 앞 판이 서가 화면 판: 원본 해시는 null', () => {
    expect(mdSyncForPhoneSave(undefined, { origin: 'web', entrySha256: MAC }, 2)).toEqual({ macSha256: null, pendingRev: 2 });
  });

  it('폰 저장, 칸은 있지만 원본 해시가 null이고 앞 판이 맥 판: 앞 판 해시로 채운다', () => {
    expect(mdSyncForPhoneSave({ macSha256: null, pendingRev: null }, { origin: 'mac', entrySha256: MAC }, 4)).toEqual({
      macSha256: MAC,
      pendingRev: 4,
    });
  });

  it('되돌림 알림: 되돌린 글의 해시가 원본 해시가 되고 폰 판은 없다', () => {
    expect(mdSyncAfterPull(PHONE)).toEqual({ macSha256: PHONE, pendingRev: null });
  });
});

describe('phoneCopyPath: ③ 때 원본 옆에 두는 파일', () => {
  it('a.md → a.phone.md', () => {
    expect(phoneCopyPath('/Users/me/projects/p/a.md')).toBe('/Users/me/projects/p/a.phone.md');
  });

  it('확장자 대소문자와 점이 든 이름', () => {
    expect(phoneCopyPath('/x/2026-11-19.plan.MD')).toBe('/x/2026-11-19.plan.phone.MD');
  });
});

describe('diffPreview: 차이 앞부분', () => {
  it('같은 앞뒤 줄은 빼고 다른 부분을 - / + 줄로 보인다', () => {
    const before = ['# 제목', '첫 줄', '맥에서 고친 줄', '끝 줄'].join('\n');
    const after = ['# 제목', '첫 줄', '폰에서 고친 줄', '끝 줄'].join('\n');
    expect(diffPreview(before, after)).toEqual(['@@ 3번째 줄부터', '- 맥에서 고친 줄', '+ 폰에서 고친 줄']);
  });

  it('줄이 많으면 앞부분만 보이고 남은 줄 수를 알린다', () => {
    const before = Array.from({ length: 30 }, (_, i) => `맥 ${i}`).join('\n');
    const after = Array.from({ length: 30 }, (_, i) => `폰 ${i}`).join('\n');
    const lines = diffPreview(before, after, 5);
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe('@@ 1번째 줄부터');
    expect(lines.slice(1, 6)).toEqual(['- 맥 0', '- 맥 1', '- 맥 2', '- 맥 3', '- 맥 4']);
    expect(lines[6]).toBe('… 55줄 더');
  });

  it('줄 끝 CRLF는 LF와 같게 본다', () => {
    expect(diffPreview('a\r\nb\r\n', 'a\nb\n')).toEqual([]);
  });

  it('줄을 더하기만 했으면 + 줄만 보인다', () => {
    expect(diffPreview('a\nb', 'a\n새 줄\nb')).toEqual(['@@ 2번째 줄부터', '+ 새 줄']);
  });
});

describe('phoneEditBlocksUpload: 맥에서 md를 다시 올릴 때 묻기 (J42)', () => {
  it('폰 판이 있으면 md 올리기 시작을 막는다', () => {
    expect(phoneEditBlocksUpload({ macSha256: MAC, pendingRev: 3 }, 'md', false)).toBe(true);
  });

  it('force면 막지 않는다', () => {
    expect(phoneEditBlocksUpload({ macSha256: MAC, pendingRev: 3 }, 'md', true)).toBe(false);
  });

  it('html 올리기는 막지 않는다(md·html 짝의 그림)', () => {
    expect(phoneEditBlocksUpload({ macSha256: MAC, pendingRev: 3 }, 'html', false)).toBe(false);
  });

  it('폰 판이 없거나 1단계 문서면 막지 않는다', () => {
    expect(phoneEditBlocksUpload({ macSha256: MAC, pendingRev: null }, 'md', false)).toBe(false);
    expect(phoneEditBlocksUpload(undefined, 'md', false)).toBe(false);
  });
});

describe('hasPendingPull: lab pull 목록에 넣을 문서 (J41)', () => {
  it('맥 원본이 있고 폰 판이 있으면 넣는다', () => {
    expect(hasPendingPull({ sourcePath: SOURCE, mdSync: { macSha256: MAC, pendingRev: 3 } })).toBe(true);
  });

  it('서가 화면 문서(원본 경로 없음)는 넣지 않는다', () => {
    expect(hasPendingPull({ sourcePath: null, mdSync: { macSha256: null, pendingRev: 3 } })).toBe(false);
  });

  it('폰 판이 없으면 넣지 않는다', () => {
    expect(hasPendingPull({ sourcePath: SOURCE, mdSync: { macSha256: MAC, pendingRev: null } })).toBe(false);
    expect(hasPendingPull({ sourcePath: SOURCE })).toBe(false);
  });
});

describe('checkPulledReport: 되돌림 알림 확인 (J41)', () => {
  it('지금 md 판과 그 판 해시가 맞으면 받는다', () => {
    expect(checkPulledReport({ rev: 3, entrySha256: PHONE }, { rev: 3, sha256: PHONE })).toBe('ok');
  });

  it('판이 다르면(그사이 다시 고침·맥 올리기) rev-changed', () => {
    expect(checkPulledReport({ rev: 4, entrySha256: OTHER }, { rev: 3, sha256: PHONE })).toBe('rev-changed');
  });

  it('판은 같은데 해시가 다르면 sha-mismatch', () => {
    expect(checkPulledReport({ rev: 3, entrySha256: PHONE }, { rev: 3, sha256: OTHER })).toBe('sha-mismatch');
  });
});
