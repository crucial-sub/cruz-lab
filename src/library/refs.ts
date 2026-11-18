// 문서 안 상대 주소 찾기 (서가 1단계 T3, Plan J15)
// - HTML·css·md에서 상대 경로 자산을 찾는다. 서가 화면과 맥 입구가 같은 함수를 쓴다.
// - 서가 화면: 올리는 파일 목록과 비교해 빠진 자산 이름을 보인다.
// - 맥 입구: 빠진 자산을 원본 폴더에서 찾아 함께 올린다.
// - I/O가 없는 순수 함수다. 정규식으로 읽는다(완전한 HTML 파서가 아니다). 놓친 자산은 화면 대조(8.2)가 잡는다.

// .ts 확장자: 맥 입구(scripts/lab.mjs)가 빌드 없이 Node로 이 파일을 가져온다(tests/library/node-load.test.ts)
import { decodeHtmlEntities, fencedLines, normalizeDocPath } from './rules.ts';

// 주소 하나를 판정한 결과
// - local: 문서 안 경로(문서 뿌리 기준, 정규화됨)
// - outside: 문서 밖을 가리킨다(../ 로 뿌리 위, / 로 시작) 또는 받을 수 없는 경로
// - external: 다른 서버 주소, data:, #조각, 템플릿 자리표시 등 (검사 대상 아님)
export type ResolvedRef = { kind: 'local'; path: string } | { kind: 'outside'; ref: string } | { kind: 'external' };

// 한 파일에서 찾은 주소
// - assets: 문서를 그리는 데 필요한 파일(그림, css, js, 영상, 글꼴)
// - links: 누르면 가는 주소(<a href>, md 링크). 맥 입구가 자동으로 함께 올리지 않는다
// - outside: 문서 밖 주소(원래 표기)
export interface RefScan {
  assets: string[];
  links: string[];
  outside: string[];
}

const EXTERNAL: ResolvedRef = { kind: 'external' };
// 'https:', 'data:', 'mailto:' 같은 주소 체계
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;

// 상대 주소 하나를 기준 폴더에서 풀어 문서 안 경로로 바꾼다
export function resolveRef(baseDir: string, rawRef: string): ResolvedRef {
  const ref = rawRef.trim();
  if (!ref || ref.startsWith('#') || ref.startsWith('//') || SCHEME.test(ref)) return EXTERNAL;
  if (ref.includes('${') || ref.includes('{{')) return EXTERNAL;

  const pathPart = ref.replace(/[?#].*$/, '');
  if (!pathPart) return EXTERNAL;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    decoded = pathPart;
  }
  decoded = decoded.normalize('NFC');
  if (decoded.startsWith('/')) return { kind: 'outside', ref };

  const parts = baseDir.split('/').filter(Boolean);
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length === 0) return { kind: 'outside', ref };
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  const path = normalizeDocPath(parts.join('/'));
  return path ? { kind: 'local', path } : { kind: 'outside', ref };
}

// 찾은 주소를 모으는 그릇 (같은 주소는 한 번만)
class RefCollector {
  private readonly assets = new Set<string>();
  private readonly links = new Set<string>();
  private readonly outside = new Set<string>();
  private readonly baseDir: string;

  // 생성자 매개변수 속성을 쓰지 않는다. Node의 타입 지우기가 받지 않는 문법이다
  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  add(rawRef: string, role: 'asset' | 'link'): void {
    const resolved = resolveRef(this.baseDir, rawRef);
    if (resolved.kind === 'local') {
      (role === 'asset' ? this.assets : this.links).add(resolved.path);
    } else if (resolved.kind === 'outside') {
      this.outside.add(resolved.ref);
    }
  }

  merge(scan: RefScan): void {
    for (const path of scan.assets) this.assets.add(path);
    for (const path of scan.links) this.links.add(path);
    for (const ref of scan.outside) this.outside.add(ref);
  }

  result(): RefScan {
    return { assets: [...this.assets], links: [...this.links], outside: [...this.outside] };
  }
}

// ---------- css ----------

// @import "x.css", @import url(x.css), url(x)
const CSS_REF = /@import\s+(?:url\(\s*)?(["']?)([^"')\s;]+)\1|url\(\s*(["']?)([^"')]*?)\3\s*\)/gi;

function collectCss(css: string, collector: RefCollector): void {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of text.matchAll(CSS_REF)) {
    const ref = match[2] ?? match[4];
    if (ref) collector.add(ref, 'asset');
  }
}

// css 파일(또는 <style> 내용)의 자산 주소
export function findCssRefs(css: string, baseDir = ''): RefScan {
  const collector = new RefCollector(baseDir);
  collectCss(css, collector);
  return collector.result();
}

// ---------- HTML ----------

// 주석, <script>·<style> 요소(본문 포함), 그 밖의 여는 태그를 문서 순서대로 읽는다
const HTML_TOKEN =
  /<!--[\s\S]*?-->|<(script|style)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1\s*>|<([a-zA-Z][\w:-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;
// 속성 하나: 이름(=값)
const HTML_ATTR = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

// srcset 후보에서 주소만 꺼낸다 (data: 주소 안의 쉼표에 속지 않게 공백 단위로 읽는다)
function srcsetUrls(value: string): string[] {
  const urls: string[] = [];
  let i = 0;
  while (i < value.length) {
    while (i < value.length && /[\s,]/.test(value[i])) i += 1;
    const start = i;
    while (i < value.length && !/\s/.test(value[i])) i += 1;
    const token = value.slice(start, i);
    const url = token.replace(/,+$/, '');
    if (url) urls.push(url);
    // 주소가 쉼표로 끝나면 설명자 없는 후보다. 바로 다음 후보를 읽는다(HTML srcset 규칙, PR #35 리뷰)
    if (token.endsWith(',')) continue;
    // 너비·배율 설명자는 다음 쉼표까지 건너뛴다
    while (i < value.length && value[i] !== ',') i += 1;
  }
  return urls;
}

// 여는 태그 하나의 속성에서 주소를 모은다
function collectTag(tagName: string, attrs: string, collector: RefCollector): void {
  const tag = tagName.toLowerCase();
  for (const match of attrs.matchAll(HTML_ATTR)) {
    const name = match[1].toLowerCase();
    const rawValue = match[2] ?? match[3] ?? match[4];
    if (rawValue === undefined) continue;
    const value = decodeHtmlEntities(rawValue);
    switch (name) {
      case 'src':
      case 'poster':
      case 'background':
      case 'xlink:href':
        collector.add(value, 'asset');
        break;
      case 'srcset':
      case 'imagesrcset':
        for (const url of srcsetUrls(value)) collector.add(url, 'asset');
        break;
      case 'data':
        if (tag === 'object') collector.add(value, 'asset');
        break;
      case 'href':
        if (tag === 'a' || tag === 'area') collector.add(value, 'link');
        else if (tag !== 'base') collector.add(value, 'asset');
        break;
      case 'style':
        collectCss(value, collector);
        break;
      default:
        break;
    }
  }
}

function collectHtml(html: string, collector: RefCollector): void {
  for (const match of html.matchAll(HTML_TOKEN)) {
    if (match[0].startsWith('<!--')) continue;
    if (match[1]) {
      // <script>·<style>: 여는 태그의 속성(src)을 읽는다. <style> 본문은 css로 읽고, <script> 본문은 읽지 않는다
      collectTag(match[1], match[2] ?? '', collector);
      if (match[1].toLowerCase() === 'style') collectCss(match[3] ?? '', collector);
      continue;
    }
    collectTag(match[4], match[5] ?? '', collector);
  }
}

// HTML 파일의 상대 주소 (J15: src, href, poster, srcset, css url())
export function findHtmlRefs(html: string, baseDir = ''): RefScan {
  const collector = new RefCollector(baseDir);
  collectHtml(html, collector);
  return collector.result();
}

// ---------- md ----------

// 코드 블록(``` · ~~~)과 줄 안 코드를 지운다. 그 안의 주소 모양은 주소가 아니다 (펜스 판정은 rules.ts fencedLines)
function stripMarkdownCode(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const fenced = fencedLines(lines);
  const kept = lines.map((line, index) => (fenced[index] ? '' : line));
  return kept.join('\n').replace(/`[^`\n]*`/g, '');
}

// 꺾쇠로 감싼 주소 <a b.png> 의 꺾쇠를 뗀다
const unwrapAngle = (url: string): string => (url.startsWith('<') && url.endsWith('>') ? url.slice(1, -1) : url);

const MD_INLINE_IMAGE = /!\[[^\]]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+["'(][^)]*)?\)/g;
const MD_INLINE_LINK = /(?<!!)\[[^\]]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+["'(][^)]*)?\)/g;
const MD_REF_IMAGE = /!\[([^\]]*)\]\[([^\]]*)\]/g;
const MD_REF_DEFINITION = /^\s{0,3}\[([^\]]+)\]:\s*(<[^>\n]+>|\S+)/gm;

// md 파일의 상대 주소: 그림(![]()·참조 그림·<img>)은 assets, 링크는 links
export function findMarkdownRefs(markdown: string, baseDir = ''): RefScan {
  const text = stripMarkdownCode(markdown);
  const collector = new RefCollector(baseDir);

  for (const match of text.matchAll(MD_INLINE_IMAGE)) collector.add(unwrapAngle(match[1]), 'asset');
  for (const match of text.matchAll(MD_INLINE_LINK)) collector.add(unwrapAngle(match[1]), 'link');
  // md 안의 HTML 태그(<img src>, <a href>)
  collectHtml(text, collector);

  const definitions = new Map<string, string>();
  for (const match of text.matchAll(MD_REF_DEFINITION)) {
    const label = match[1].trim().toLowerCase();
    if (!definitions.has(label)) definitions.set(label, unwrapAngle(match[2]));
  }
  for (const match of text.matchAll(MD_REF_IMAGE)) {
    const label = (match[2] || match[1]).trim().toLowerCase();
    const url = definitions.get(label);
    if (url) collector.add(url, 'asset');
  }
  return collector.result();
}

// 올리는 목록에 없는 자산 (NFC로 비교한다)
export function missingRefs(refs: Iterable<string>, present: Iterable<string>): string[] {
  const have = new Set<string>();
  for (const path of present) have.add(path.normalize('NFC'));
  const missing = new Set<string>();
  for (const ref of refs) {
    const path = ref.normalize('NFC');
    if (!have.has(path)) missing.add(path);
  }
  return [...missing];
}
