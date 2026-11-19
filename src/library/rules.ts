// 문서 서가 순수 규칙 (서가 1단계 T3, Plan J8·J10·J13)
// - I/O가 없는 순수 함수만 둔다. 서버, 맥 입구(Node), 서가 화면(브라우저)이 함께 쓴다.
// - 그래서 node: 모듈을 가져오지 않는다.

// 같은 문서의 형식 두 가지. 같은 키의 md와 html은 한 문서다(짝 묶기)
export type DocFormat = 'md' | 'html';

// 받는 형식 (J10). 확장자 → Content-Type
// - jpeg는 jpg와 같은 형식이라 함께 받는다.
// - svg는 블로그에서 거부하지만, 문서 출처는 블로그와 다른 출처라서 받는다.
export const LIBRARY_FILE_TYPES: Readonly<Record<string, string>> = {
  html: 'text/html; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

// 크기 한도 (J10)
export const MAX_FILE_BYTES = 100 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 200 * 1024 * 1024;
export const MAX_FILE_COUNT = 500;
export const MAX_PATH_LENGTH = 512;
export const MAX_TITLE_LENGTH = 200;

// 형식별 진입 파일. 문서 출처 주소가 늘 /{문서 id}/index.html 이 되도록 고정한다 (J4)
export const ENTRY_PATHS: Readonly<Record<DocFormat, string>> = {
  html: 'index.html',
  md: 'index.md',
};

// 제어 문자(NUL, 줄바꿈 등)
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
// 퍼센트 인코딩 조각. 저장 경로에는 두지 않는다(두 번 풀어 우회하는 길을 막는다)
const PERCENT_ESCAPE = /%[0-9a-fA-F]{2}/;

// 문서 안 파일 경로를 정규화한다. 받을 수 없는 경로면 null
// - NFC로 맞춘다(macOS 파일 이름은 NFD다. 문서 안 주소는 보통 NFC다)
// - 절대 경로, 역슬래시, 드라이브 문자, 빈 칸·./.. 조각, 숨은 파일, 제어 문자, 퍼센트 인코딩을 거부한다
export function normalizeDocPath(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const path = raw.normalize('NFC');
  if (path.length === 0 || path.length > MAX_PATH_LENGTH) return null;
  if (path.startsWith('/') || path.includes('\\') || /^[A-Za-z]:/.test(path)) return null;
  if (CONTROL_CHARS.test(path) || PERCENT_ESCAPE.test(path)) return null;
  const segments = path.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..' || segment.startsWith('.')) return null;
  }
  return path;
}

// 경로의 확장자(소문자). 없으면 ''
function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

// 받는 형식이면 Content-Type, 아니면 null
// - 표의 자기 속성만 본다. 'constructor' 같은 객체 기본 속성 이름이 형식으로 통과하지 않게 한다(PR #35 리뷰)
export function contentTypeForPath(path: string): string | null {
  const extension = extensionOf(path);
  return Object.hasOwn(LIBRARY_FILE_TYPES, extension) ? LIBRARY_FILE_TYPES[extension] : null;
}

// ---------- 올리기 목록 검사 ----------

// 입구가 보내는 파일 하나
export interface ManifestFile {
  path: string;
  bytes: number;
  sha256: string;
}

// 검사를 통과한 파일 하나
export interface NormalizedFile {
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
}

export type ManifestErrorCode =
  | 'EMPTY'
  | 'TOO_MANY_FILES'
  | 'BAD_PATH'
  | 'BAD_TYPE'
  | 'BAD_HASH'
  | 'BAD_SIZE'
  | 'FILE_TOO_LARGE'
  | 'TOTAL_TOO_LARGE'
  | 'DUPLICATE_PATH'
  | 'NO_ENTRY';

export interface ManifestError {
  code: ManifestErrorCode;
  path?: string;
}

export type ManifestResult =
  | { ok: true; files: NormalizedFile[]; totalBytes: number }
  | { ok: false; errors: ManifestError[] };

const SHA256_HEX = /^[0-9a-f]{64}$/;

// 올리기 목록 하나를 검사한다 (J10)
// - 파일마다 경로·형식·해시·크기를 본다. 틀린 것을 모두 모아 알린다.
// - 형식별 진입 파일(index.html / index.md)이 있어야 한다.
export function validateManifest(format: DocFormat, files: readonly ManifestFile[]): ManifestResult {
  const errors: ManifestError[] = [];
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, errors: [{ code: 'EMPTY' }] };
  }
  if (files.length > MAX_FILE_COUNT) {
    errors.push({ code: 'TOO_MANY_FILES' });
  }

  const normalized: NormalizedFile[] = [];
  const seen = new Set<string>();
  let totalBytes = 0;

  for (const file of files) {
    const rawPath = typeof file?.path === 'string' ? file.path : '';
    const path = normalizeDocPath(rawPath);
    if (!path) {
      errors.push({ code: 'BAD_PATH', path: rawPath });
      continue;
    }
    const contentType = contentTypeForPath(path);
    if (!contentType) {
      errors.push({ code: 'BAD_TYPE', path });
      continue;
    }
    if (typeof file.sha256 !== 'string' || !SHA256_HEX.test(file.sha256)) {
      errors.push({ code: 'BAD_HASH', path });
      continue;
    }
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) {
      errors.push({ code: 'BAD_SIZE', path });
      continue;
    }
    if (file.bytes > MAX_FILE_BYTES) {
      errors.push({ code: 'FILE_TOO_LARGE', path });
      continue;
    }
    if (seen.has(path)) {
      errors.push({ code: 'DUPLICATE_PATH', path });
      continue;
    }
    seen.add(path);
    totalBytes += file.bytes;
    normalized.push({ path, bytes: file.bytes, sha256: file.sha256, contentType });
  }

  if (totalBytes > MAX_TOTAL_BYTES) errors.push({ code: 'TOTAL_TOO_LARGE' });
  if (!seen.has(ENTRY_PATHS[format])) errors.push({ code: 'NO_ENTRY', path: ENTRY_PATHS[format] });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, files: normalized, totalBytes };
}

// ---------- 같은 문서 판정 키 (J8) ----------

// 문서 형식 확장자(.md, .html). 키를 만들 때 뺀다
const FORMAT_EXTENSION = /\.(md|html)$/i;

// 홈 폴더 아래 경로면 ~/… 로 바꾼다
export function toHomePath(absolutePath: string, home: string): string {
  const path = absolutePath.normalize('NFC');
  const base = home.normalize('NFC').replace(/\/+$/, '');
  if (base && (path === base || path.startsWith(`${base}/`))) {
    return `~${path.slice(base.length)}`;
  }
  return path;
}

// 맥 입구의 같은 문서 키: 원본 절대 경로(홈은 ~, 형식 확장자와 끝의 / 는 뺀 것)
// - 같은 이름의 md와 html, 그리고 같은 이름의 폴더 문서가 한 문서가 된다
export function docKeyFromSourcePath(sourcePath: string, home: string): string {
  const path = toHomePath(sourcePath, home).replace(/\/+$/, '').replace(FORMAT_EXTENSION, '');
  return `mac:${path}`;
}

// 서가 화면의 같은 문서 키: 프로젝트 + 올린 상대 경로(형식 확장자 뺀 것)
export function docKeyFromWebPath(project: string, relativePath: string): string {
  const path = relativePath.normalize('NFC').replace(/^\/+|\/+$/g, '').replace(FORMAT_EXTENSION, '');
  return `web:${project.normalize('NFC')}/${path}`;
}

// ---------- 자동 분류 (J13) ----------

// 원본 경로로 프로젝트 이름을 정한다
// - ~/projects/{이름}/… → 이름
// - ~/Desktop/docs/… → 'desktop'
// - 그 밖 → 'other'
export function projectFromSourcePath(sourcePath: string, home: string): string {
  const path = toHomePath(sourcePath, home);
  const project = path.match(/^~\/projects\/([^/]+)\/.+/);
  if (project) return project[1];
  if (/^~\/Desktop\/docs\/.+/.test(path)) return 'desktop';
  return 'other';
}

// 파일 이름의 YYYY-MM-DD. 앞뒤가 숫자에 붙어 있거나 없는 날짜면 null
export function docDateFromName(name: string): string | null {
  const match = name.match(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  const valid =
    date.getUTCFullYear() === Number(y) && date.getUTCMonth() === Number(m) - 1 && date.getUTCDate() === Number(d);
  return valid ? `${y}-${m}-${d}` : null;
}

// 마크다운 한 줄 안의 꾸밈을 지운다(링크·강조·코드)
function plainInlineMarkdown(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

// md 줄마다 코드 펜스에 속하는지 (여는 줄·닫는 줄 포함). 제목 뽑기(titleFromMarkdown)와 상대 주소 찾기(refs.ts)가 쓴다
// - CommonMark 규칙: 닫는 펜스는 여는 펜스와 같은 글자이고, 길이가 여는 펜스 이상이고, 뒤에 공백만 온다.
//   그래서 긴 펜스 안의 짧은 펜스와 정보 문자열이 붙은 펜스(```js)는 코드 내용이다(PR #35 리뷰).
// - 백틱 펜스의 정보 문자열에 백틱이 있으면 펜스가 아니다(줄 안 코드다).
export function fencedLines(lines: readonly string[]): boolean[] {
  let open: { char: string; length: number } | null = null;
  return lines.map((line) => {
    if (open === null) {
      const opening = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
      if (!opening || (opening[1][0] === '`' && opening[2].includes('`'))) return false;
      open = { char: opening[1][0], length: opening[1].length };
      return true;
    }
    const closing = line.match(/^\s{0,3}(`{3,}|~{3,})[ \t]*$/);
    if (closing && closing[1][0] === open.char && closing[1].length >= open.length) open = null;
    return true;
  });
}

// 맨 앞 앞머리(--- … ---)를 지운다. 닫는 줄이 없으면 그대로 둔다 (md 뷰어 render-md.ts, 검색 색인 search.ts)
export function stripFrontmatter(markdown: string): string {
  const text = markdown.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return text;
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---');
  if (end < 0) return text;
  return lines.slice(end + 1).join('\n');
}

// md의 첫 # 제목. 앞머리(---)와 코드 블록 안은 건너뛴다. 없으면 null
export function titleFromMarkdown(markdown: string): string | null {
  const lines = markdown.replace(/^\uFEFF/, '').split(/\r?\n/);
  let index = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---');
    if (end > 0) index = end + 1;
  }
  const body = lines.slice(index);
  const fenced = fencedLines(body);
  for (const [i, line] of body.entries()) {
    if (fenced[i]) continue;
    const heading = line.match(/^\s{0,3}#(?!#)\s+(.*?)(?:\s+#+\s*)?$/);
    if (heading) {
      const title = plainInlineMarkdown(heading[1]);
      if (title) return title;
    }
  }
  return null;
}

// HTML 엔티티 몇 가지를 푼다 (제목용)
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

// 태그 안의 글자만 남긴다
function htmlText(fragment: string): string {
  return decodeHtmlEntities(fragment.replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

// HTML 제목: <title>, 비었으면 첫 <h1>. 없으면 null
export function titleFromHtml(html: string): string | null {
  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  const title = withoutComments.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (title) {
    const text = htmlText(title[1]);
    if (text) return text;
  }
  const h1 = withoutComments.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const text = htmlText(h1[1]);
    if (text) return text;
  }
  return null;
}

// 문서 제목 (J13): md 첫 # 제목 또는 HTML <title>·첫 <h1>, 없으면 파일 이름(확장자 뺀 것)
export function extractTitle(input: { format: DocFormat; text: string; fileName: string }): string {
  const found = input.format === 'md' ? titleFromMarkdown(input.text) : titleFromHtml(input.text);
  const name = input.fileName.normalize('NFC').replace(/^.*\//, '');
  const fallback = name.replace(/\.[^.]+$/, '') || name;
  return Array.from((found ?? fallback).normalize('NFC')).slice(0, MAX_TITLE_LENGTH).join('');
}

// ---------- 입구가 준 원본 정보 ----------

// 맥 입구(명령·Raycast): 원본 경로를 ~/… 로 준다(서버는 맥의 홈 경로를 모른다)
// 서가 화면: 프로젝트와 올린 상대 경로를 준다(브라우저는 원본의 전체 경로를 모른다)
export type UploadSource =
  | { kind: 'mac'; sourcePath: string; fileName: string }
  | { kind: 'web'; project: string; relativePath: string; fileName: string };

export interface UploadIdentity {
  key: string;
  sourcePath: string | null;
  project: string;
  docDate: string | null;
}

// 프로젝트 이름: 영문·숫자·한글·-·_·. 1~64자 (경로 구분자 없음)
const PROJECT_NAME = /^[\p{L}\p{N}_.-]{1,64}$/u;

// 서가 화면이 고른 프로젝트 이름이 받을 수 있는 꼴인가 (NFC로 맞춘 뒤 본다)
export function isProjectName(value: string): boolean {
  const project = value.normalize('NFC');
  return PROJECT_NAME.test(project) && project !== '.' && project !== '..';
}

// 맥 원본 경로 검사: ~/ 로 시작하고, 빈 칸·./.. 조각과 제어 문자가 없다
// - 숨은 폴더(~/projects/x/.claude/worktrees/…)는 받는다. 키로만 쓰고 파일 경로로 쓰지 않는다
function isSafeMacPath(sourcePath: string): boolean {
  if (!sourcePath.startsWith('~/') || sourcePath.length > 1024 || CONTROL_CHARS.test(sourcePath)) return false;
  return sourcePath
    .slice(2)
    .split('/')
    .every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

// 원본 정보를 검사하고 같은 문서 키·프로젝트·날짜를 정한다. 틀리면 null
export function identifyUpload(source: UploadSource): UploadIdentity | null {
  const docDate = docDateFromName(source.fileName);
  if (source.kind === 'mac') {
    const sourcePath = source.sourcePath.normalize('NFC').replace(/\/+$/, '');
    if (!isSafeMacPath(sourcePath)) return null;
    return {
      key: docKeyFromSourcePath(sourcePath, ''),
      sourcePath,
      project: projectFromSourcePath(sourcePath, ''),
      docDate,
    };
  }
  const project = source.project.normalize('NFC');
  const relativePath = source.relativePath.normalize('NFC').replace(/\/+$/, '');
  if (!isProjectName(project)) return null;
  if (!normalizeDocPath(relativePath)) return null;
  return { key: docKeyFromWebPath(project, relativePath), sourcePath: null, project, docDate };
}

// 새 판을 마무리할 때: 그 판을 쓸지, 어느 판의 파일을 지울지 (J9)
// - 지금 판이 없거나 새 판이 더 새것이면 새 판을 쓰고 앞 판을 지운다.
// - 늦게 끝난 옛 판이면 쓰지 않고 그 판을 지운다. 같은 판이면 아무것도 하지 않는다.
export function planRevisionSwitch(current: number | null, incoming: number): { activate: boolean; retire: number | null } {
  if (current === null || incoming > current) return { activate: true, retire: current };
  return { activate: false, retire: incoming === current ? null : incoming };
}
