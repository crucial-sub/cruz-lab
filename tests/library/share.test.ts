// 공유 순수 함수 테스트 (서가 2단계 T8, Plan J44~J46·J49)
// - 범위 판정(문서·프로젝트·폴더), 폴더 계산(맥 입구·바탕화면·서가 화면), 기간 계산, 끝남·꺼짐, 공유 id 꼴
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SHARE_DURATION,
  SHARE_DURATIONS,
  docFolder,
  folderCovers,
  isShareDuration,
  isShareId,
  newShareId,
  normalizeShareFolder,
  parseShareScope,
  shareCookieTtlSec,
  shareCoversDoc,
  shareExpiresAt,
  shareLabel,
  shareRemainingLabel,
  shareState,
  sharedByLines,
} from '@/library/share';

const NOW = Date.UTC(2026, 10, 20, 3, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

describe('공유 id (J44)', () => {
  it('무작위 18바이트 → base64url 24자', () => {
    const id = newShareId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{24}$/);
    expect(isShareId(id)).toBe(true);
    expect(newShareId()).not.toBe(id);
  });

  it('주어진 바이트로 만들면 늘 같은 값이다', () => {
    const bytes = new Uint8Array(18).fill(255);
    expect(newShareId(() => bytes)).toBe('________________________');
  });

  it('꼴이 틀리면 거짓', () => {
    expect(isShareId('a'.repeat(23))).toBe(false);
    expect(isShareId('a'.repeat(25))).toBe(false);
    expect(isShareId(`${'a'.repeat(23)}.`)).toBe(false);
    expect(isShareId(`${'a'.repeat(23)}/`)).toBe(false);
    expect(isShareId(undefined)).toBe(false);
    expect(isShareId(42)).toBe(false);
  });
});

describe('기간 (J44·L7)', () => {
  it('1일·7일·30일·끌 때까지. 기본은 7일', () => {
    expect(Object.keys(SHARE_DURATIONS)).toEqual(['1d', '7d', '30d', 'forever']);
    expect(DEFAULT_SHARE_DURATION).toBe('7d');
    expect(isShareDuration('30d')).toBe(true);
    expect(isShareDuration('2d')).toBe(false);
  });

  it('끝나는 시각: 기간을 더한다. 끌 때까지는 null', () => {
    expect(shareExpiresAt('1d', NOW)).toBe(NOW + DAY);
    expect(shareExpiresAt('7d', NOW)).toBe(NOW + 7 * DAY);
    expect(shareExpiresAt('30d', NOW)).toBe(NOW + 30 * DAY);
    expect(shareExpiresAt('forever', NOW)).toBeNull();
  });
});

describe('공유 상태: 살아 있음·끝남·꺼짐', () => {
  it('끄면 기간과 상관없이 꺼짐', () => {
    expect(shareState({ expiresAtMs: null, revokedAtMs: NOW - 1 }, NOW)).toBe('revoked');
    expect(shareState({ expiresAtMs: NOW + DAY, revokedAtMs: NOW - 1 }, NOW)).toBe('revoked');
  });

  it('끝나는 시각이 지나면 끝남. 끌 때까지는 끝나지 않는다', () => {
    expect(shareState({ expiresAtMs: NOW, revokedAtMs: null }, NOW)).toBe('expired');
    expect(shareState({ expiresAtMs: NOW + 1, revokedAtMs: null }, NOW)).toBe('live');
    expect(shareState({ expiresAtMs: null, revokedAtMs: null }, NOW + 1000 * DAY)).toBe('live');
  });
});

describe('공유 쿠키 수명 (J47): 12시간과 남은 기간 중 짧은 쪽', () => {
  it('남은 기간이 길면 12시간', () => {
    expect(shareCookieTtlSec(NOW + 7 * DAY, NOW)).toBe(12 * 60 * 60);
    expect(shareCookieTtlSec(null, NOW)).toBe(12 * 60 * 60);
  });

  it('남은 기간이 짧으면 남은 초(내림)', () => {
    expect(shareCookieTtlSec(NOW + 90_500, NOW)).toBe(90);
  });

  it('끝났으면 0', () => {
    expect(shareCookieTtlSec(NOW - 1, NOW)).toBe(0);
    expect(shareCookieTtlSec(NOW + 400, NOW)).toBe(0);
  });
});

describe('폴더 계산 (J45)', () => {
  it('맥 입구: ~/projects/{p}/ 뒤 경로의 폴더', () => {
    expect(docFolder('mac:~/projects/interview-lab/bundles/a/b')).toBe('bundles/a');
    expect(docFolder('mac:~/projects/interview-lab/docs/plan')).toBe('docs');
    expect(docFolder('mac:~/projects/interview-lab/readme')).toBe('');
  });

  it('바탕화면 문서: ~/Desktop/docs/ 뒤', () => {
    expect(docFolder('mac:~/Desktop/docs/2026/report')).toBe('2026');
    expect(docFolder('mac:~/Desktop/docs/report')).toBe('');
  });

  it('그 밖의 맥 경로(프로젝트 other): ~/ 뒤', () => {
    expect(docFolder('mac:~/Documents/notes/a')).toBe('Documents/notes');
  });

  it('서가 화면: 올린 상대 경로의 폴더', () => {
    expect(docFolder('web:library-smoke/share/a')).toBe('share');
    expect(docFolder('web:library-smoke/a')).toBe('');
  });

  it('모르는 키는 뿌리', () => {
    expect(docFolder('x:y')).toBe('');
  });
});

describe('폴더가 덮는가: 그 폴더와 하위 폴더', () => {
  it('같은 폴더와 하위 폴더를 덮는다', () => {
    expect(folderCovers('bundles', 'bundles')).toBe(true);
    expect(folderCovers('bundles', 'bundles/a/b')).toBe(true);
  });

  it('이름이 앞에서 겹쳐도 다른 폴더는 덮지 않는다 (bundles ≠ bundles2)', () => {
    expect(folderCovers('bundles', 'bundles2')).toBe(false);
    expect(folderCovers('bundles', 'bundles2/a')).toBe(false);
    expect(folderCovers('bundles/a', 'bundles')).toBe(false);
    expect(folderCovers('bundles', '')).toBe(false);
  });
});

describe('공유 폴더 이름 맞추기', () => {
  it('앞뒤 /를 떼고 NFC로 맞춘다', () => {
    expect(normalizeShareFolder('/bundles/a/')).toBe('bundles/a');
    expect(normalizeShareFolder('한글'.normalize('NFD'))).toBe('한글');
  });

  it('빈 값, ., .., 빈 조각, 제어 문자는 거절(null)', () => {
    expect(normalizeShareFolder('')).toBeNull();
    expect(normalizeShareFolder('/')).toBeNull();
    expect(normalizeShareFolder('a/../b')).toBeNull();
    expect(normalizeShareFolder('./a')).toBeNull();
    expect(normalizeShareFolder('a//b')).toBeNull();
    expect(normalizeShareFolder('a\u0000b')).toBeNull();
    expect(normalizeShareFolder('a'.repeat(513))).toBeNull();
  });
});

describe('범위 판정 (J46): 모든 공유 경로가 이 함수를 거친다', () => {
  const doc = { id: 'aaaaaaaaaaaaaaaaaaaa', project: 'interview-lab', folder: 'bundles/a' };

  it('문서 하나: 그 문서만', () => {
    expect(shareCoversDoc({ kind: 'doc', docId: doc.id }, doc)).toBe(true);
    expect(shareCoversDoc({ kind: 'doc', docId: 'bbbbbbbbbbbbbbbbbbbb' }, doc)).toBe(false);
  });

  it('프로젝트 전체: 그 프로젝트의 모든 폴더', () => {
    expect(shareCoversDoc({ kind: 'project', project: 'interview-lab' }, doc)).toBe(true);
    expect(shareCoversDoc({ kind: 'project', project: 'interview-lab' }, { ...doc, folder: '' })).toBe(true);
    expect(shareCoversDoc({ kind: 'project', project: 'cruz-lab' }, doc)).toBe(false);
  });

  it('폴더: 같은 프로젝트의 그 폴더와 하위 폴더', () => {
    expect(shareCoversDoc({ kind: 'folder', project: 'interview-lab', folder: 'bundles' }, doc)).toBe(true);
    expect(shareCoversDoc({ kind: 'folder', project: 'interview-lab', folder: 'bundles/a' }, doc)).toBe(true);
    expect(shareCoversDoc({ kind: 'folder', project: 'interview-lab', folder: 'bundles2' }, doc)).toBe(false);
    expect(shareCoversDoc({ kind: 'folder', project: 'other-lab', folder: 'bundles' }, doc)).toBe(false);
    expect(shareCoversDoc({ kind: 'folder', project: 'interview-lab', folder: 'bundles' }, { ...doc, folder: '' })).toBe(false);
  });
});

describe('요청 본문의 공유 범위 읽기', () => {
  it('세 꼴을 받는다. 폴더는 맞춘다', () => {
    expect(parseShareScope({ kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa' })).toEqual({ kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa' });
    expect(parseShareScope({ kind: 'project', project: 'interview-lab' })).toEqual({ kind: 'project', project: 'interview-lab' });
    expect(parseShareScope({ kind: 'folder', project: 'interview-lab', folder: '/bundles/' })).toEqual({
      kind: 'folder',
      project: 'interview-lab',
      folder: 'bundles',
    });
  });

  it('꼴이 틀리면 null', () => {
    expect(parseShareScope(null)).toBeNull();
    expect(parseShareScope({ kind: 'doc', docId: '../x' })).toBeNull();
    expect(parseShareScope({ kind: 'project', project: 'a/b' })).toBeNull();
    expect(parseShareScope({ kind: 'folder', project: 'p', folder: '..' })).toBeNull();
    expect(parseShareScope({ kind: 'all' })).toBeNull();
  });
});

describe('공유 이름 (J49 og:title, 공유 중 칸)', () => {
  it('문서 하나는 문서 제목, 프로젝트는 이름, 폴더는 "프로젝트 · 폴더"', () => {
    expect(shareLabel({ kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa' }, '면접 묶음')).toBe('면접 묶음');
    expect(shareLabel({ kind: 'doc', docId: 'aaaaaaaaaaaaaaaaaaaa' }, null)).toBe('문서');
    expect(shareLabel({ kind: 'project', project: 'interview-lab' })).toBe('interview-lab');
    expect(shareLabel({ kind: 'folder', project: 'interview-lab', folder: 'bundles' })).toBe('interview-lab · bundles');
  });
});

describe('남은 기간 글 (공유 중 칸): 올림으로 센다', () => {
  it('방금 만든 공유는 고른 기간 그대로 보인다 (7일 → "7일 남음", 1일 → "1일 남음")', () => {
    expect(shareRemainingLabel(null, NOW)).toBe('끌 때까지');
    expect(shareRemainingLabel(NOW + 7 * DAY, NOW)).toBe('7일 남음');
    expect(shareRemainingLabel(NOW + 7 * DAY - 1000, NOW)).toBe('7일 남음');
    expect(shareRemainingLabel(NOW + DAY - 1000, NOW)).toBe('1일 남음');
    expect(shareRemainingLabel(NOW + 30 * DAY - 1000, NOW)).toBe('30일 남음');
  });

  it('하루가 안 남으면 시간, 한 시간이 안 남으면 분 (올림)', () => {
    expect(shareRemainingLabel(NOW + DAY + 60_000, NOW)).toBe('2일 남음');
    expect(shareRemainingLabel(NOW + 5 * 60 * 60 * 1000, NOW)).toBe('5시간 남음');
    expect(shareRemainingLabel(NOW + 5 * 60 * 60 * 1000 + 1, NOW)).toBe('6시간 남음');
    expect(shareRemainingLabel(NOW + 30 * 60 * 1000, NOW)).toBe('30분 남음');
    expect(shareRemainingLabel(NOW + 10_000, NOW)).toBe('1분 남음');
  });

  it('끝났으면 "끝남"', () => {
    expect(shareRemainingLabel(NOW, NOW)).toBe('끝남');
    expect(shareRemainingLabel(NOW - 1, NOW)).toBe('끝남');
  });
});

// 서가 2단계 T9 (J52): 올리기 결과의 경고 줄. 서가 화면·lab push·Raycast·Finder 알림이 같은 글을 쓴다
describe('sharedByLines: 공유 중 경고 줄', () => {
  it('묶음은 "공유 중인 묶음 …에 들어갔습니다", 문서 하나는 "공유 중인 문서입니다"', () => {
    expect(
      sharedByLines([
        { id: 'a', kind: 'folder', label: 'interview-lab · bundles' },
        { id: 'b', kind: 'project', label: 'interview-lab' },
        { id: 'c', kind: 'doc', label: '질문 1' },
      ]),
    ).toEqual([
      "공유 중인 묶음 'interview-lab · bundles'에 들어갔습니다. 주소를 아는 사람이 읽습니다.",
      "공유 중인 묶음 'interview-lab'에 들어갔습니다. 주소를 아는 사람이 읽습니다.",
      '공유 중인 문서입니다. 공유 주소로 이 판이 보입니다.',
    ]);
  });

  it('없거나 꼴이 틀리면 빈 목록 (옛 서버 응답에는 sharedBy가 없다)', () => {
    expect(sharedByLines(undefined)).toEqual([]);
    expect(sharedByLines(null)).toEqual([]);
    expect(sharedByLines([{ id: 1 }])).toEqual([]);
  });
});
