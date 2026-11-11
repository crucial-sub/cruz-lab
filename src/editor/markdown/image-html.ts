// 이미지 폭·정렬의 원시 HTML 읽기·쓰기 (재건 5단계 D13)
// - 폭·정렬이 있는 이미지는 원시 HTML로 쓴다(GitHub README 관례). 모양은 두 가지다.
//   폭만: <img src="…" alt="…" title="…" width="600">
//   정렬(가운데·오른쪽, 폭 선택): <p align="center"><img src="…" alt="…" width="600"></p>
// - 읽기(parseImageHtml)는 mdast 블록 html 노드의 값을 받는다. 받는 속성은 src·alt·title·width와 <p>의 align뿐이다.
//   그 밖의 모양·속성이면 null이다. 변환기는 그때 지금처럼 "지원하지 않는 HTML" 경고 + 글자로 둔다.
// - "이미지만 있는 단락" 판정(soloImageIndex, canHoldImageLayout)도 여기에 둔다.
//   변환기(from-doc)와 에디터 표시(ui/image-layout.ts)가 같은 판정을 쓴다(보이는 대로 저장).
// - DOM이 필요 없다. Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙이고 '@/' 별칭을 쓰지 않는다.

import { isVideoUrl } from '../../lib/content/safe-url.ts';

// 폭 범위(px, 정수)
export const IMAGE_WIDTH_MIN = 16;
export const IMAGE_WIDTH_MAX = 4096;

// 저장하는 정렬 값. 왼쪽은 기본값이라 저장하지 않는다(null)
export type ImageAlign = 'center' | 'right';

export interface ImageHtml {
  src: string;
  alt: string | null;
  title: string | null;
  width: number | null;
  align: ImageAlign | null;
}

// 폭 값을 정수 px로 맞춘다. 숫자이거나 숫자만 있는 글자이고 범위 안이어야 한다. 아니면 null
export function normalizeImageWidth(value: unknown): number | null {
  let width = Number.NaN;
  if (typeof value === 'number') width = value;
  else if (typeof value === 'string' && /^[ \t\n\r\f]*\d+[ \t\n\r\f]*$/.test(value)) {
    width = Number(value);
  }
  return Number.isInteger(width) && width >= IMAGE_WIDTH_MIN && width <= IMAGE_WIDTH_MAX
    ? width
    : null;
}

// 정렬 값을 맞춘다. center·right만 남긴다(대소문자 무시). left와 그 밖은 null
export function normalizeImageAlign(value: unknown): ImageAlign | null {
  if (typeof value !== 'string') return null;
  const align = value.trim().toLowerCase();
  return align === 'center' || align === 'right' ? align : null;
}

// 노드 속성에서 저장할 폭·정렬. 둘 다 없거나 영상이면 null
// - 공개 페이지는 영상 주소를 <video>로 바꾸고 폭을 버린다(markdown.ts rehypePublicRules). 그래서 영상에는 쓰지 않는다
export function imageLayoutOf(
  attrs: Record<string, unknown> | undefined,
): { width: number | null; align: ImageAlign | null } | null {
  if (!attrs) return null;
  const width = normalizeImageWidth(attrs.width);
  const align = normalizeImageAlign(attrs.align);
  if (width === null && align === null) return null;
  if (typeof attrs.src === 'string' && isVideoUrl(attrs.src)) return null;
  return { width, align };
}

// ───────────── 이미지만 있는 단락 ─────────────

// 브라우저가 접는 공백(from-doc의 블록 앞뒤 공백 규칙과 같다). NBSP는 그려지므로 넣지 않는다
const COLLAPSIBLE_ONLY = /^[ \t\n\r\f]*$/;

// 단락 자식 하나의 모양 (문서 JSON과 ProseMirror 노드를 같은 판정에 넣으려고 줄인 것)
export interface InlineShape {
  type: string;
  text?: string;
  // 마크(링크·굵게 등)가 있는지
  marked: boolean;
}

// 이미지만 있는 단락이면 그 이미지의 자식 순번, 아니면 -1
// - 자식은 이미지 노드 하나와 접히는 공백만 있는 글자 노드뿐이어야 한다. 이미지에는 마크가 없어야 한다
export function soloImageIndex(children: ReadonlyArray<InlineShape>): number {
  let found = -1;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.type === 'text' && COLLAPSIBLE_ONLY.test(child.text ?? '')) continue;
    if (child.type !== 'image' || child.marked || found !== -1) return -1;
    found = index;
  }
  return found;
}

// 단락 자식이 접히는 공백 글자뿐인지(빈 단락). 이런 단락은 마크다운에 쓰이지 않는다(from-doc)
export function isBlankInline(children: ReadonlyArray<InlineShape>): boolean {
  return children.every(
    (child) => child.type === 'text' && COLLAPSIBLE_ONLY.test(child.text ?? ''),
  );
}

// 부모 안에서 writtenIndex번째로 쓰이는 단락에 HTML 블록(폭·정렬)을 쓸 수 있는지
// - writtenIndex는 마크다운에 실제로 쓰이는 블록 순번이다. 빈 단락은 쓰이지 않으므로 세지 않는다(리뷰 S3).
// - 표 셀은 인라인이라 HTML 블록을 쓸 수 없다.
// - 체크 항목에서 처음 쓰이는 블록은 `- [ ] ` 표시와 한 줄이라 HTML 블록이 되지 않는다(체크 상자가 사라진다).
// - 모르는 부모는 쓰지 않는다(새 노드가 생겨도 조용히 깨지지 않게)
const LAYOUT_PARENTS = new Set(['doc', 'blockquote', 'callout', 'listItem', 'taskItem']);

export function canHoldImageLayout(parentType: string, writtenIndex: number): boolean {
  if (!LAYOUT_PARENTS.has(parentType)) return false;
  return !(parentType === 'taskItem' && writtenIndex === 0);
}

// ───────────── 쓰기 ─────────────

// 속성 값 이스케이프. 줄바꿈도 문자 참조로 쓴다(HTML 블록은 여는 태그가 한 줄에 있어야 한다)
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '&#10;')
    .replace(/\r/g, '&#13;');
}

// 이미지 → 원시 HTML 한 줄. 속성 순서는 src alt title width. alt는 늘 쓰고 title은 값이 있을 때만 쓴다
export function imageHtml(image: ImageHtml): string {
  const parts = [
    `src="${escapeAttribute(image.src)}"`,
    `alt="${escapeAttribute(image.alt ?? '')}"`,
  ];
  if (image.title) parts.push(`title="${escapeAttribute(image.title)}"`);
  if (image.width !== null) parts.push(`width="${image.width}"`);
  const img = `<img ${parts.join(' ')}>`;
  return image.align ? `<p align="${image.align}">${img}</p>` : img;
}

// ───────────── 읽기 ─────────────

// HTML 공백
const WHITESPACE = /[ \t\n\r\f]*/y;
// 태그 이름 (CommonMark 원시 HTML)
const TAG_NAME = /<([A-Za-z][A-Za-z0-9-]*)/y;
// 속성 이름 (CommonMark 원시 HTML)
const ATTRIBUTE_NAME = /[A-Za-z_:][A-Za-z0-9_.:-]*/y;
// 따옴표 없는 속성 값 (CommonMark 원시 HTML)
const UNQUOTED_VALUE = /[^ \t\n\r\f"'=<>`]+/y;
// 닫는 </p>
const CLOSE_P = /<\/p[ \t\n\r\f]*>/iy;
// 문자 참조: 십진·십육진 숫자, 이름
const CHARACTER_REFERENCE = /&(?:#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6})|([A-Za-z][A-Za-z0-9]*));/g;
// 푸는 이름 참조. 그 밖의 이름 참조가 있으면 읽지 않는다(글자가 바뀌지 않게)
const NAMED_REFERENCES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function skipWhitespace(source: string, position: number): number {
  WHITESPACE.lastIndex = position;
  WHITESPACE.exec(source);
  return WHITESPACE.lastIndex;
}

// 코드 포인트가 글자로 쓸 수 있는 값인지 (0, 서로게이트, 범위 밖은 브라우저가 U+FFFD로 바꾼다)
function isUsableCodePoint(code: number): boolean {
  return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
}

// 세미콜론 없는 이름 참조로 읽힐 수 있는 `&`가 있는지(리뷰 S9)
// - 속성 값에서 브라우저는 `&lt b`처럼 세미콜론 없는 옛 이름 참조 일부를 풀어 읽는다. 에디터가 글자 그대로 두면
//   저장할 때 `&amp;lt b`가 되어 뜻이 바뀐다.
// - `&이름` 바로 뒤가 `=`이면 브라우저도 풀지 않는다(주소의 `&token=`). 뒤가 끝·공백·문장 부호일 때만 위험으로 본다.
const BARE_NAME = /&([A-Za-z][A-Za-z0-9]*)(?![A-Za-z0-9;])(.?)/g;
function hasAmbiguousReference(value: string): boolean {
  for (const match of value.replace(CHARACTER_REFERENCE, '').matchAll(BARE_NAME)) {
    if (match[2] !== '=') return true;
  }
  return false;
}

// 문자 참조를 푼다. 모르는 이름 참조나 쓸 수 없는 숫자 참조, 세미콜론 없는 이름 참조로 읽힐 글자가 있으면 null
function decodeCharacterReferences(value: string): string | null {
  if (hasAmbiguousReference(value)) return null;
  let failed = false;
  const decoded = value.replace(
    CHARACTER_REFERENCE,
    (match, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (name !== undefined) {
        const named = NAMED_REFERENCES[name];
        if (named === undefined) failed = true;
        return named ?? match;
      }
      const code = decimal !== undefined ? Number(decimal) : Number.parseInt(hex ?? '', 16);
      if (!isUsableCodePoint(code)) {
        failed = true;
        return match;
      }
      return String.fromCodePoint(code);
    },
  );
  return failed ? null : decoded;
}

interface OpenTag {
  name: string;
  // 소문자 속성 이름 → 문자 참조를 푼 값
  attributes: Map<string, string>;
  // 태그가 끝난 다음 자리
  end: number;
}

// position에서 시작하는 여는 태그 하나를 읽는다(`>`·`/>`로 끝난다). 문법에 맞지 않거나 같은 속성이 두 번이면 null
function readOpenTag(source: string, position: number): OpenTag | null {
  TAG_NAME.lastIndex = position;
  const head = TAG_NAME.exec(source);
  if (!head) return null;
  const name = head[1].toLowerCase();
  const attributes = new Map<string, string>();
  let cursor = TAG_NAME.lastIndex;
  for (;;) {
    const before = cursor;
    cursor = skipWhitespace(source, cursor);
    if (source.startsWith('/>', cursor)) return { name, attributes, end: cursor + 2 };
    if (source[cursor] === '>') return { name, attributes, end: cursor + 1 };
    // 속성 앞에는 공백이 있어야 한다
    if (cursor === before) return null;
    ATTRIBUTE_NAME.lastIndex = cursor;
    const attributeName = ATTRIBUTE_NAME.exec(source);
    if (!attributeName) return null;
    cursor = ATTRIBUTE_NAME.lastIndex;
    let raw = '';
    const afterName = skipWhitespace(source, cursor);
    if (source[afterName] === '=') {
      cursor = skipWhitespace(source, afterName + 1);
      const quote = source[cursor];
      if (quote === '"' || quote === "'") {
        const close = source.indexOf(quote, cursor + 1);
        if (close === -1) return null;
        raw = source.slice(cursor + 1, close);
        cursor = close + 1;
      } else {
        UNQUOTED_VALUE.lastIndex = cursor;
        const unquoted = UNQUOTED_VALUE.exec(source);
        if (!unquoted) return null;
        raw = unquoted[0];
        cursor = UNQUOTED_VALUE.lastIndex;
      }
    }
    const key = attributeName[0].toLowerCase();
    if (attributes.has(key)) return null;
    const value = decodeCharacterReferences(raw);
    if (value === null) return null;
    attributes.set(key, value);
  }
}

// <img>의 속성 → 이미지. 받는 속성은 src·alt·title·width뿐이다
const IMAGE_ATTRIBUTES = new Set(['src', 'alt', 'title', 'width']);

function imageOfTag(tag: OpenTag, align: ImageAlign | null): ImageHtml | null {
  if (tag.name !== 'img') return null;
  for (const name of tag.attributes.keys()) {
    if (!IMAGE_ATTRIBUTES.has(name)) return null;
  }
  const src = tag.attributes.get('src');
  if (!src) return null;
  let width: number | null = null;
  if (tag.attributes.has('width')) {
    width = normalizeImageWidth(tag.attributes.get('width'));
    if (width === null) return null;
  }
  return {
    src,
    alt: tag.attributes.get('alt') ?? null,
    title: tag.attributes.get('title') || null,
    width,
    align,
  };
}

// <p>의 align 값 → 정렬. left는 기본값(null)이다. 그 밖의 값이면 undefined(읽지 않는다)
function alignOfParagraph(tag: OpenTag): ImageAlign | null | undefined {
  if (tag.name !== 'p' || tag.attributes.size !== 1) return undefined;
  const value = tag.attributes.get('align')?.trim().toLowerCase();
  if (value === 'left') return null;
  if (value === 'center' || value === 'right') return value;
  return undefined;
}

// 블록 html 노드의 값 → 이미지. 두 모양(<img …>, <p align="…"><img …></p>)이 아니면 null
// - 앞뒤 공백과 태그 사이 공백(줄바꿈 포함)은 무시한다. 속성 값은 큰따옴표·작은따옴표·따옴표 없음을 모두 받는다
export function parseImageHtml(value: string): ImageHtml | null {
  const source = value.replace(/^[ \t\n\r\f]+|[ \t\n\r\f]+$/g, '');
  const first = readOpenTag(source, 0);
  if (!first) return null;
  if (first.name === 'img') return first.end === source.length ? imageOfTag(first, null) : null;

  const align = alignOfParagraph(first);
  if (align === undefined) return null;
  const image = readOpenTag(source, skipWhitespace(source, first.end));
  if (!image) return null;
  CLOSE_P.lastIndex = skipWhitespace(source, image.end);
  if (!CLOSE_P.exec(source) || CLOSE_P.lastIndex !== source.length) return null;
  return imageOfTag(image, align);
}
