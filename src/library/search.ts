// 서가 검색 순수 함수 (서가 2단계 T2, Plan J26·J27)
// - 색인 글자 뽑기: 올리기 마무리(server/uploads.ts)와 색인 채우기 스크립트(scripts/ops/library-search-backfill.mjs)가
//   진입 파일의 글에서 검색할 글자만 뽑는다. md는 앞머리와 문법 기호를 덜고, html은 script·style·태그를 지운다.
//   형식마다 200 KB(UTF-8)까지만 둔다. Firestore 문서 한도(1 MiB) 안이다.
// - 찾기: 서버가 색인 전체를 메모리에 두고(server/search-store.ts) 이 함수로 찾는다. 한국어는 부분 문자열로 충분하다.
//   NFC로 맞추고 대소문자를 무시한다. 띄어 쓴 낱말은 모두 들어간 문서만 낸다. 제목에 맞은 문서가 먼저다.
// - 결과의 제목·글 조각은 HTML 이스케이프한 뒤 맞은 낱말을 <mark>로 감싼다. 페이지는 이 글을 그대로 넣는다(set:html).
// - I/O가 없다. 색인 채우기 스크립트가 빌드 없이 Node로 가져온다. 그래서 상대 가져오기에 .ts를 붙인다.

import { decodeHtmlEntities, fencedLines, stripFrontmatter, type DocFormat } from './rules.ts';

// 형식마다 색인에 두는 글자 상한 200 KB (J26)
export const SEARCH_TEXT_MAX_BYTES = 200 * 1024;
// 색인을 만들려고 읽는 진입 파일의 앞부분 5 MB (J26)
export const SEARCH_ENTRY_READ_BYTES = 5 * 1024 * 1024;
// 검색어 낱말 수 상한, 결과 수 기본 상한
export const MAX_SEARCH_TERMS = 8;
export const DEFAULT_SEARCH_LIMIT = 50;
// 글 조각: 맞은 낱말 앞 글자 수, 맞은 낱말부터 뒤 글자 수, 본문에 맞은 낱말이 없을 때 보이는 앞부분 글자 수
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 100;
const SNIPPET_HEAD = 120;

// ---------- 글자 뽑기 ----------

// 낱말 안에 들어가는 줄 안 태그. 지울 때 띄우지 않는다(<b>한</b>글 → 한글). 그 밖의 태그는 띄운다(블록 사이)
const INLINE_TAGS = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'cite',
  'code',
  'data',
  'del',
  'dfn',
  'em',
  'font',
  'i',
  'img',
  'ins',
  'kbd',
  'mark',
  'q',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',
]);

// 여는·닫는 태그 하나 (속성 값 안의 > 에 속지 않는다. refs.ts와 같은 꼴)
const HTML_TAG = /<\/?([a-zA-Z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/g;
// data: 주소. 앞이 글자·숫자면 낱말 일부다(metadata: 같은 글)
const DATA_URL = /(^|[^\p{L}\p{N}_])data:[^\s"'<>()]+/gu;

// 태그를 지운다. 줄 안 태그는 붙이고 그 밖은 띄운다
function stripTags(text: string): string {
  return text.replace(HTML_TAG, (_whole, name: string) => (INLINE_TAGS.has(name.toLowerCase()) ? '' : ' '));
}

// 마지막 손질: 개체 풀기, data: 주소 지우기, 공백 줄이기, NFC
function finish(text: string): string {
  return decodeHtmlEntities(text).replace(DATA_URL, '$1').replace(/\s+/g, ' ').trim().normalize('NFC');
}

// md 한 줄의 블록 기호를 던다 (제목 #, 인용 >, 목록 기호, 할 일 칸, 표 세로줄)
function plainMarkdownLine(line: string): string {
  // 참조 정의([이름]: 주소)는 글이 아니다
  if (/^\s{0,3}\[[^\]]+\]:\s*\S/.test(line)) return '';
  // 가로줄과 표 구분 줄
  if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) return '';
  if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) return '';
  return line
    .replace(/^\s*(>\s?)+/, '')
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/\s+#+\s*$/, '')
    .replace(/^\s*([-*+]|\d{1,9}[.)])\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/\|/g, ' ');
}

// md → 검색 글자 (J26: 앞머리와 문법 기호를 덜어 낸 글)
// - 코드 펜스 줄(``` · ~~~)은 지우고 코드 내용은 남긴다(코드 안 낱말도 찾는다).
// - 링크·그림은 글만 남기고 주소를 지운다. md 안 HTML 태그도 지운다.
export function markdownSearchText(markdown: string): string {
  const lines = stripFrontmatter(markdown).split(/\r?\n/);
  const fenced = fencedLines(lines);
  const kept = lines.map((line, index) => {
    if (fenced[index]) return /^\s{0,3}(`{3,}|~{3,})/.test(line) ? '' : line;
    return plainMarkdownLine(line);
  });
  const text = kept
    .join('\n')
    // 그림·링크: 글만 남긴다(주소를 지운다)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    // 각주 표시 [^1]
    .replace(/\[\^[^\]]+\]/g, '')
    // 꺾쇠 주소 <https://…>
    .replace(/<((?:https?|mailto):[^>\s]+)>/g, '$1');
  return finish(
    stripTags(text)
      .replace(/`+/g, '')
      .replace(/(\*\*|__|~~)/g, '')
      .replace(/\*/g, '')
      // 밑줄 강조 _글_ (앞뒤가 글자가 아닐 때만. LIBRARY_ENABLED 같은 이름은 그대로 둔다)
      .replace(/(^|[^\p{L}\p{N}_])_([^_\n]+)_(?=[^\p{L}\p{N}_]|$)/gu, '$1$2'),
  );
}

// html → 검색 글자 (J26: script·style을 빼고 태그를 지운 글)
// - 주석과 head(제목·메타·스타일)도 뺀다. 제목은 문서 기록의 제목으로 따로 찾는다.
// - JS가 그리는 글은 없다(Plan 10절 위험 8. 알려진 한계).
export function htmlSearchText(html: string): string {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    // <!doctype …>, <?xml …?>
    .replace(/<[!?][^>]*>/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<head\b[\s\S]*?<\/head\s*>/gi, ' ');
  return finish(stripTags(text));
}

// UTF-8 바이트 상한으로 자른다. 글자 중간에서 끊지 않는다
export function truncateUtf8(text: string, maxBytes: number): string {
  // 글자 하나는 UTF-8로 3바이트 이하다(UTF-16 코드 단위 하나당). 이 길이면 자를 일이 없다
  if (text.length * 3 <= maxBytes) return text;
  const bytes = new TextEncoder().encode(text);
  if (bytes.length <= maxBytes) return text;
  let cut = maxBytes;
  // 이어지는 바이트(10xxxxxx)이면 글자 머리까지 물러난다
  while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) cut -= 1;
  return new TextDecoder().decode(bytes.subarray(0, cut));
}

// 진입 파일 글 → 색인에 둘 글자 (형식에 맞게 뽑고 200 KB로 자른다)
export function searchTextOf(format: DocFormat, text: string): string {
  const extracted = format === 'md' ? markdownSearchText(text) : htmlSearchText(text);
  return truncateUtf8(extracted, SEARCH_TEXT_MAX_BYTES);
}

// ---------- 찾기 ----------

// 찾을 문서 하나: 서가 목록의 id·제목과 색인 글자
export interface SearchDoc {
  id: string;
  title: string;
  md?: string;
  html?: string;
}

// 찾은 문서 하나. 제목·글 조각은 이스케이프한 HTML이다
export interface SearchHit {
  id: string;
  titleHtml: string;
  snippetHtml: string | null;
  titleMatches: number; // 제목에 든 낱말 수(순위)
}

// 검색어 → 낱말 목록 (NFC, 띄어쓰기로 나눔, 대소문자만 다른 같은 낱말은 하나, 8개까지)
export function searchTerms(query: string): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const term of query.normalize('NFC').split(/\s+/)) {
    const key = term.toLowerCase();
    if (!term || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === MAX_SEARCH_TERMS) break;
  }
  return terms;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 낱말 하나를 대소문자 무시로 찾는 정규식
const termPattern = (term: string): RegExp => new RegExp(escapeRegExp(term), 'iu');

// 낱말 여럿을 한꺼번에 찾는 정규식 (긴 낱말을 먼저 맞춘다)
function termsPattern(terms: readonly string[]): RegExp {
  const sorted = [...terms].sort((a, b) => b.length - a.length);
  return new RegExp(sorted.map(escapeRegExp).join('|'), 'giu');
}

const HTML_ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

// 글을 이스케이프하고 맞은 낱말을 <mark>로 감싼다
export function highlightHtml(text: string, terms: readonly string[]): string {
  const usable = terms.filter(Boolean);
  if (usable.length === 0) return escapeHtml(text);
  let html = '';
  let last = 0;
  for (const match of text.matchAll(termsPattern(usable))) {
    const start = match.index ?? 0;
    html += `${escapeHtml(text.slice(last, start))}<mark>${escapeHtml(match[0])}</mark>`;
    last = start + match[0].length;
  }
  return html + escapeHtml(text.slice(last));
}

// 코드 단위로 자른 끝이 대리 쌍(이모지 등)을 가르면 반쪽을 버린다
function sliceWhole(text: string, start: number, end: number): string {
  let from = start;
  let to = end;
  if (from > 0 && /[\uDC00-\uDFFF]/.test(text[from] ?? '')) from += 1;
  if (to < text.length && /[\uD800-\uDBFF]/.test(text[to - 1] ?? '')) to -= 1;
  return text.slice(from, to);
}

// 글 조각: 본문에서 가장 먼저 맞은 낱말의 앞뒤. 맞은 낱말이 없으면 본문 앞부분. 본문이 없으면 null
function snippetOf(body: string, terms: readonly string[]): string | null {
  if (!body) return null;
  const first = body.search(termsPattern(terms));
  const start = first < 0 ? 0 : Math.max(0, first - SNIPPET_BEFORE);
  const end = first < 0 ? SNIPPET_HEAD : first + SNIPPET_AFTER;
  const piece = sliceWhole(body, start, Math.min(body.length, end));
  const lead = start > 0 ? '…' : '';
  const tail = end < body.length ? '…' : '';
  return `${lead}${highlightHtml(piece, terms)}${tail}`;
}

// 문서 목록에서 찾는다 (J27)
// - 낱말마다 제목·md·html 중 한 곳에 들어 있어야 한다(모든 낱말).
// - 제목에 든 낱말이 많은 문서가 먼저다. 같으면 들어온 순서(서가 목록 = 최근 문서 먼저)다.
export function searchDocs(docs: readonly SearchDoc[], query: string, options: { limit?: number } = {}): SearchHit[] {
  const terms = searchTerms(query);
  if (terms.length === 0) return [];
  const patterns = terms.map(termPattern);
  const hits: SearchHit[] = [];
  for (const doc of docs) {
    const title = doc.title.normalize('NFC');
    const md = doc.md ?? '';
    const html = doc.html ?? '';
    const all = patterns.every((pattern) => pattern.test(title) || pattern.test(md) || pattern.test(html));
    if (!all) continue;
    // 글 조각은 낱말이 든 본문(md 먼저)에서 뽑는다
    const body = md && patterns.some((pattern) => pattern.test(md)) ? md : html && patterns.some((pattern) => pattern.test(html)) ? html : md || html;
    hits.push({
      id: doc.id,
      titleHtml: highlightHtml(title, terms),
      snippetHtml: snippetOf(body, terms),
      titleMatches: patterns.filter((pattern) => pattern.test(title)).length,
    });
  }
  // Array.prototype.sort는 안정 정렬이다. 같은 순위는 들어온 순서를 지킨다
  hits.sort((a, b) => b.titleMatches - a.titleMatches);
  return hits.slice(0, options.limit ?? DEFAULT_SEARCH_LIMIT);
}
