// md 사이 링크 풀이 (서가 2단계 T3, Plan J30~J33)
// - md 뷰어 렌더(server/render-md.ts)가 공유 파이프라인의 linkUrl 옵션으로 부른다. 블로그는 부르지 않는다(J29).
// - .md·.html 링크: 이 문서의 같은 문서 키(J8)가 가리키는 폴더를 기준으로 상대 경로를 푼다 → 대상 키(확장자 뺀 것)
//   → docIdForKey → /admin/library/d/{id}. .html이면 ?v=html(짝 문서에서 그림을 연다). #조각은 둔다.
//   원래 링크 글(ref)과 앞 문서(from)를 붙인다. 대상이 서가에 없으면 그 주소의 화면이 이 둘로 안내한다(J31).
// - 데이터를 읽지 않는다. 문서 id가 키에서 정해지므로, 대상을 나중에 올려도 링크가 그대로 열린다.
//   렌더 캐시(판 번호 키)가 낡지 않는다(J30).
// - 그 밖의 파일 링크(그림·csv·txt 등): 이 판에 있으면 문서 출처 주소, 없으면 /admin/library/missing 안내 화면(J32).
// - 바깥 주소(http:·mailto:·//…), #조각만인 링크, 빈 주소는 그대로 둔다(null).
// - 키 접두사(mac:·web:)가 다르므로 맥 입구 문서는 맥 문서끼리, 서가 화면 문서는 같은 프로젝트끼리 이어진다(J33).
// - 알려진 한계: 폴더째 올린 md 문서(꼴 b)도 파일 하나로 올린 문서처럼 키의 부모 폴더를 기준으로 푼다.
//   서버는 두 꼴을 구별할 값을 갖지 않는다(키·원본 경로·파일 이름의 꼴이 같다).

import { resolveRef } from './refs.ts';
import { docIdForKey, isDocId } from './ticket.ts';

// 'https:', 'mailto:' 같은 주소 체계
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/;
// 서가 문서로 가는 링크 (키를 만들 때와 같이 대소문자 없이 본다. rules.ts FORMAT_EXTENSION)
const DOC_LINK = /\.(md|html)$/i;
const HTML_LINK = /\.html$/i;

// md 뷰어 한 문서의 링크 풀이 재료
export interface LibraryLinkContext {
  key: string; // 이 문서의 같은 문서 키 (mac:~/… 또는 web:{프로젝트}/…)
  docId: string; // 이 문서 id (안내 화면의 "← 앞 문서")
  files: ReadonlySet<string>; // 이 판의 파일 경로 (문서 안 경로, NFC)
  fileUrl: (path: string) => string; // 판 안 파일 → 문서 출처 주소
  docPath?: (docId: string) => string; // 문서 id → 서가 문서 주소. 공유 화면(PR-C)이 바꾼다
}

const defaultDocPath = (docId: string): string => `/admin/library/d/${docId}`;

// 주소의 경로 부분(쿼리·조각을 뗀 것)을 풀어 NFC로 맞춘다
function decodedPathOf(href: string): string {
  const pathPart = href.trim().replace(/[?#].*$/, '');
  let decoded = pathPart;
  try {
    decoded = decodeURIComponent(pathPart);
  } catch {
    // 잘못된 인코딩은 쓰인 그대로 본다
  }
  return decoded.normalize('NFC');
}

// .md·.html 링크의 대상 문서 키. 풀 수 없으면 null
// - 맥 키는 ~ 위로, 서가 화면 키는 프로젝트 위로 나갈 수 없다. 절대 경로(/…)도 풀지 않는다.
export function linkTargetKey(key: string, href: string): string | null {
  const match = key.match(/^(mac|web):(.+)$/);
  if (!match) return null;
  const [, kind, keyPath] = match;
  const path = decodedPathOf(href);
  if (!DOC_LINK.test(path) || path.startsWith('/')) return null;

  // 키는 문서 파일 경로에서 확장자를 뺀 것이다. 그 부모 폴더가 링크의 기준이다
  const parts = keyPath.split('/').slice(0, -1);
  if (kind === 'mac' && parts[0] !== '~') return null;
  // 뿌리: 맥은 ~, 서가 화면은 프로젝트 이름. 그 위로는 나갈 수 없다
  const rootLength = 1;
  if (parts.length < rootLength) return null;
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      if (parts.length <= rootLength) return null;
      parts.pop();
      continue;
    }
    parts.push(segment);
  }
  if (parts.length <= rootLength) return null;
  return `${kind}:${parts.join('/').replace(DOC_LINK, '')}`;
}

// 문서 하나의 링크 바꾸기 함수 (공유 파이프라인 linkUrl.rewrite)
export function libraryLinkUrl(context: LibraryLinkContext): (href: string) => string | null {
  const docPath = context.docPath ?? defaultDocPath;
  const missing = (ref: string) => `/admin/library/missing?from=${context.docId}&ref=${encodeURIComponent(ref)}`;
  return (rawHref) => {
    const href = rawHref.trim();
    if (!href || href.startsWith('#') || href.startsWith('?') || href.startsWith('//') || SCHEME.test(href)) return null;
    const hashIndex = href.indexOf('#');
    const fragment = hashIndex >= 0 ? href.slice(hashIndex) : '';

    const path = decodedPathOf(href);
    if (DOC_LINK.test(path)) {
      const target = linkTargetKey(context.key, href);
      if (!target) return missing(href);
      const view = HTML_LINK.test(path) ? 'v=html&' : '';
      return `${docPath(docIdForKey(target))}?${view}ref=${encodeURIComponent(href)}&from=${context.docId}${fragment}`;
    }

    // 그 밖의 파일: 이 판 안의 경로로 푼다 (그림 주소 바꾸기와 같은 resolveRef)
    const resolved = resolveRef('', href);
    if (resolved.kind === 'external') return null;
    if (resolved.kind === 'local' && context.files.has(resolved.path)) return `${context.fileUrl(resolved.path)}${fragment}`;
    return missing(href);
  };
}

// 안내 화면에 보이는 링크 글의 길이 상한
const MAX_NOTICE_REF = 300;

// "서가에 없는 문서"(J31)·"판에 없는 파일"(J32) 화면이 주소에서 링크 글(ref)과 앞 문서(from)를 읽는다
// - from은 문서 id 꼴일 때만 쓴다("← 앞 문서" 링크가 다른 주소로 가지 않게 한다).
// - ref는 화면에 글자로만 보인다(Astro가 이스케이프한다). 300자로 자른다.
export function readLinkNotice(params: URLSearchParams): { ref: string | null; from: string | null } {
  const ref = params.get('ref')?.trim() ?? '';
  const from = params.get('from') ?? '';
  return { ref: ref ? Array.from(ref).slice(0, MAX_NOTICE_REF).join('') : null, from: isDocId(from) ? from : null };
}
