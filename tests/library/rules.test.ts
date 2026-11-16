// 문서 서가 순수 규칙 테스트 (서가 1단계 T3, Plan J8·J10·J13)
import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_BYTES,
  MAX_FILE_COUNT,
  MAX_TOTAL_BYTES,
  contentTypeForPath,
  docDateFromName,
  docKeyFromSourcePath,
  docKeyFromWebPath,
  extractTitle,
  normalizeDocPath,
  projectFromSourcePath,
  titleFromHtml,
  titleFromMarkdown,
  toHomePath,
  validateManifest,
  type ManifestFile,
} from '@/library/rules';

const HOME = '/Users/tester';
const SHA = 'a'.repeat(64);

describe('normalizeDocPath: 문서 안 파일 경로 정규화', () => {
  it('보통 경로는 그대로 둔다', () => {
    expect(normalizeDocPath('index.html')).toBe('index.html');
    expect(normalizeDocPath('shots/a b.png')).toBe('shots/a b.png');
    expect(normalizeDocPath('cruz-lab-audit-assets/home-desktop.png')).toBe('cruz-lab-audit-assets/home-desktop.png');
  });

  it('맥의 NFD 한글 이름을 NFC로 바꾼다', () => {
    const nfd = '그림/이미지.png'.normalize('NFD');
    expect(normalizeDocPath(nfd)).toBe('그림/이미지.png'.normalize('NFC'));
  });

  it('상위 폴더, 현재 폴더, 빈 칸 경로를 거부한다', () => {
    expect(normalizeDocPath('../secret.html')).toBeNull();
    expect(normalizeDocPath('a/../../b.png')).toBeNull();
    expect(normalizeDocPath('a/../b.png')).toBeNull();
    expect(normalizeDocPath('./a.png')).toBeNull();
    expect(normalizeDocPath('a//b.png')).toBeNull();
    expect(normalizeDocPath('a/')).toBeNull();
    expect(normalizeDocPath('')).toBeNull();
  });

  it('절대 경로와 역슬래시를 거부한다', () => {
    expect(normalizeDocPath('/etc/passwd')).toBeNull();
    expect(normalizeDocPath('C:/x.png')).toBeNull();
    expect(normalizeDocPath('a\\b.png')).toBeNull();
    expect(normalizeDocPath('..\\b.png')).toBeNull();
  });

  it('인코딩 우회를 거부한다', () => {
    expect(normalizeDocPath('%2e%2e/a.png')).toBeNull();
    expect(normalizeDocPath('a%2Fb.png')).toBeNull();
    expect(normalizeDocPath('a%5cb.png')).toBeNull();
  });

  it('제어 문자와 숨은 파일을 거부한다', () => {
    expect(normalizeDocPath('a\u0000.png')).toBeNull();
    expect(normalizeDocPath('a\n.png')).toBeNull();
    expect(normalizeDocPath('.DS_Store')).toBeNull();
    expect(normalizeDocPath('.git/config')).toBeNull();
  });

  it('너무 긴 경로를 거부한다', () => {
    expect(normalizeDocPath('a/'.repeat(300) + 'b.png')).toBeNull();
  });
});

describe('contentTypeForPath: 받는 형식 (J10)', () => {
  it('J10의 확장자를 받는다', () => {
    expect(contentTypeForPath('index.html')).toBe('text/html; charset=utf-8');
    expect(contentTypeForPath('index.md')).toBe('text/markdown; charset=utf-8');
    expect(contentTypeForPath('a.CSS')).toBe('text/css; charset=utf-8');
    expect(contentTypeForPath('m.mjs')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeForPath('d.csv')).toBe('text/csv; charset=utf-8');
    expect(contentTypeForPath('i.svg')).toBe('image/svg+xml');
    expect(contentTypeForPath('p.jpg')).toBe('image/jpeg');
    expect(contentTypeForPath('p.jpeg')).toBe('image/jpeg');
    expect(contentTypeForPath('v.mp4')).toBe('video/mp4');
    expect(contentTypeForPath('s.mp3')).toBe('audio/mpeg');
    expect(contentTypeForPath('f.woff2')).toBe('font/woff2');
    expect(contentTypeForPath('f.otf')).toBe('font/otf');
  });

  it('목록에 없는 형식은 null', () => {
    expect(contentTypeForPath('build.py')).toBeNull();
    expect(contentTypeForPath('doc.pdf')).toBeNull();
    expect(contentTypeForPath('noext')).toBeNull();
    expect(contentTypeForPath('page.htm')).toBeNull();
  });
});

describe('validateManifest: 올리기 목록 검사', () => {
  const file = (path: string, bytes = 10): ManifestFile => ({ path, bytes, sha256: SHA });

  it('html 문서는 index.html이 있어야 한다', () => {
    const result = validateManifest('html', [file('index.html'), file('shots/a.png')]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.files.map((f) => f.contentType)).toEqual(['text/html; charset=utf-8', 'image/png']);
      expect(result.totalBytes).toBe(20);
    }
    const noEntry = validateManifest('html', [file('other.html')]);
    expect(noEntry.ok).toBe(false);
    if (!noEntry.ok) expect(noEntry.errors.map((e) => e.code)).toContain('NO_ENTRY');
  });

  it('md 문서는 index.md가 있어야 한다', () => {
    expect(validateManifest('md', [file('index.md'), file('img/a.png')]).ok).toBe(true);
    const r = validateManifest('md', [file('index.html')]);
    expect(r.ok).toBe(false);
  });

  it('경로를 정규화하고 정규화 뒤 같은 경로를 중복으로 본다', () => {
    const nfd = '그림.png'.normalize('NFD');
    const r = validateManifest('html', [file('index.html'), file(nfd), file('그림.png')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toContainEqual({ code: 'DUPLICATE_PATH', path: '그림.png' });
  });

  it('나쁜 경로·형식·해시·크기를 하나씩 알린다', () => {
    const r = validateManifest('html', [
      file('index.html'),
      file('../x.png'),
      file('build.py'),
      { path: 'a.png', bytes: 10, sha256: 'zz' },
      { path: 'b.png', bytes: -1, sha256: SHA },
      { path: 'c.png', bytes: 1.5, sha256: SHA },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual([
        { code: 'BAD_PATH', path: '../x.png' },
        { code: 'BAD_TYPE', path: 'build.py' },
        { code: 'BAD_HASH', path: 'a.png' },
        { code: 'BAD_SIZE', path: 'b.png' },
        { code: 'BAD_SIZE', path: 'c.png' },
      ]);
    }
  });

  it('파일 하나 100 MB, 전체 200 MB, 파일 500개를 넘으면 거부한다', () => {
    const big = validateManifest('html', [file('index.html'), file('v.mp4', MAX_FILE_BYTES + 1)]);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.errors).toContainEqual({ code: 'FILE_TOO_LARGE', path: 'v.mp4' });

    const atLimit = validateManifest('html', [file('index.html'), file('v.mp4', MAX_FILE_BYTES)]);
    expect(atLimit.ok).toBe(true);

    const total = validateManifest('html', [
      file('index.html'),
      file('a.mp4', MAX_FILE_BYTES),
      file('b.mp4', MAX_FILE_BYTES),
    ]);
    expect(total.ok).toBe(false);
    if (!total.ok) expect(total.errors.map((e) => e.code)).toContain('TOTAL_TOO_LARGE');
    expect(MAX_TOTAL_BYTES).toBe(200 * 1024 * 1024);

    const many = [file('index.html'), ...Array.from({ length: MAX_FILE_COUNT }, (_, i) => file(`i/${i}.png`))];
    const tooMany = validateManifest('html', many);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.errors.map((e) => e.code)).toContain('TOO_MANY_FILES');
  });

  it('빈 목록을 거부한다', () => {
    const r = validateManifest('html', []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.map((e) => e.code)).toContain('EMPTY');
  });
});

describe('같은 문서 판정 키 (J8)', () => {
  it('맥 입구: 홈을 ~로 바꾸고 md·html 확장자를 뺀다', () => {
    expect(docKeyFromSourcePath(`${HOME}/Desktop/docs/2026-11-16-x.md`, HOME)).toBe('mac:~/Desktop/docs/2026-11-16-x');
    expect(docKeyFromSourcePath(`${HOME}/Desktop/docs/2026-11-16-x.html`, HOME)).toBe('mac:~/Desktop/docs/2026-11-16-x');
    expect(docKeyFromSourcePath(`${HOME}/Desktop/docs/X.HTML`, HOME)).toBe('mac:~/Desktop/docs/X');
  });

  it('맥 입구: 폴더 문서는 폴더 경로가 키다. 끝의 / 는 뺀다', () => {
    expect(docKeyFromSourcePath(`${HOME}/Desktop/docs/beer-pour-mood/`, HOME)).toBe('mac:~/Desktop/docs/beer-pour-mood');
    expect(docKeyFromSourcePath(`${HOME}/Desktop/docs/beer-pour-mood`, HOME)).toBe(
      docKeyFromSourcePath(`${HOME}/Desktop/docs/beer-pour-mood.md`, HOME),
    );
  });

  it('맥 입구: NFD 경로도 NFC 키가 된다. 홈 밖 경로는 그대로 둔다', () => {
    expect(docKeyFromSourcePath(`${HOME}/문서/가.md`.normalize('NFD'), HOME)).toBe('mac:~/문서/가'.normalize('NFC'));
    expect(docKeyFromSourcePath('/Volumes/usb/a.md', HOME)).toBe('mac:/Volumes/usb/a');
  });

  it('서가 화면: 프로젝트 + 올린 상대 경로(확장자 뺀 것)', () => {
    expect(docKeyFromWebPath('desktop', 'notes/plan.md')).toBe('web:desktop/notes/plan');
    expect(docKeyFromWebPath('desktop', 'notes/plan.html')).toBe('web:desktop/notes/plan');
    expect(docKeyFromWebPath('cruz-lab', 'beer-pour-mood')).toBe('web:cruz-lab/beer-pour-mood');
  });

  it('toHomePath: 홈 아래만 ~로 바꾼다', () => {
    expect(toHomePath(`${HOME}/a/b.md`, HOME)).toBe('~/a/b.md');
    expect(toHomePath(`${HOME}x/a.md`, HOME)).toBe(`${HOME}x/a.md`);
  });
});

describe('자동 분류 (J13)', () => {
  it('프로젝트: ~/projects/{이름}, 바탕화면 문서 폴더는 desktop, 그 밖은 other', () => {
    expect(projectFromSourcePath(`${HOME}/projects/beer-pour/docs/a.md`, HOME)).toBe('beer-pour');
    expect(projectFromSourcePath(`${HOME}/projects/cruz-lab/.claude/worktrees/w/docs/a.md`, HOME)).toBe('cruz-lab');
    expect(projectFromSourcePath(`${HOME}/Desktop/docs/sub/a.html`, HOME)).toBe('desktop');
    expect(projectFromSourcePath(`${HOME}/Downloads/a.md`, HOME)).toBe('other');
    expect(projectFromSourcePath(`${HOME}/projects/a.md`, HOME)).toBe('other');
  });

  it('날짜: 파일 이름의 YYYY-MM-DD. 없는 날짜는 null', () => {
    expect(docDateFromName('2026-11-16-library-stage1-plan.md')).toBe('2026-11-16');
    expect(docDateFromName('plan-2026-02-30.md')).toBeNull();
    expect(docDateFromName('개념학습 로드맵.html')).toBeNull();
    expect(docDateFromName('v20261116.md')).toBeNull();
  });

  it('md 제목: 첫 # 제목. 앞머리와 코드 블록 안은 건너뛴다', () => {
    expect(titleFromMarkdown('---\ntitle: x\n---\n\n# 서가 **1단계** Plan\n\n## 둘')).toBe('서가 1단계 Plan');
    expect(titleFromMarkdown('```md\n# 코드 안\n```\n# 진짜 제목 #')).toBe('진짜 제목');
    expect(titleFromMarkdown('## 둘째 수준만\n본문')).toBeNull();
    expect(titleFromMarkdown('# [링크](a.md)와 `코드`')).toBe('링크와 코드');
  });

  it('html 제목: <title>, 없으면 첫 <h1>. 엔티티를 풀고 태그를 뺀다', () => {
    expect(titleFromHtml('<html><head><title> 문서 &amp; 서가 </title></head><h1>다른 것</h1>')).toBe('문서 & 서가');
    expect(titleFromHtml('<title></title><h1 class="x">첫 <em>제목</em>&#33;</h1>')).toBe('첫 제목!');
    expect(titleFromHtml('<p>제목 없음</p>')).toBeNull();
  });

  it('extractTitle: 뽑지 못하면 파일 이름(확장자 뺀 것)', () => {
    expect(extractTitle({ format: 'md', text: '# 가', fileName: 'x.md' })).toBe('가');
    expect(extractTitle({ format: 'html', text: '<p>없음</p>', fileName: '2026-11-06-audit.html' })).toBe('2026-11-06-audit');
    expect(extractTitle({ format: 'md', text: 'x'.repeat(10), fileName: 'notes.md' })).toBe('notes');
  });

  it('extractTitle: 제목은 200자로 자른다', () => {
    expect(extractTitle({ format: 'md', text: `# ${'가'.repeat(300)}`, fileName: 'a.md' })).toHaveLength(200);
  });
});
