// 원시 HTML 안전 처리 (재건 3단계 리뷰 6.2 지적 11)
// - 마크다운의 원시 HTML은 rehype-raw를 지나 그대로 hast가 된다. 미리보기는 그 결과를 innerHTML로 넣으므로
//   스크립트가 관리자 origin에서 돌 수 있다. 공개 페이지(react-markdown)는 문자열 이벤트 속성을 붙이지 않는다.
// - 이 플러그인은 rehype-raw 바로 뒤에 돈다. 그 뒤의 KaTeX·하이라이트 결과(style 속성, svg)는 건드리지 않는다.
// - 하는 일:
//   1. 실행·이동·입력을 만드는 요소를 지운다(script, style, form, object, embed, base, meta, svg 애니메이션 등).
//   2. iframe은 임베드 주소(youtube-nocookie·codesandbox의 /embed/<id>)만 남기고 속성을 안전한 값으로 다시 쓴다.
//   3. on* 이벤트 속성, srcdoc, srcset, http-equiv를 지운다.
//   4. 주소 속성(href, src, xlink:href, action, poster, cite 등)에 safeUrl을 적용한다.
// - Node 스크립트가 가져오므로 상대 경로 import에 .ts를 붙인다.

import type { Element, Properties, Root } from 'hast';
import { SKIP, visit } from 'unist-util-visit';
import { EMBED_IFRAME_REFERRER_POLICY, EMBED_IFRAME_SANDBOX } from './embed-url.ts';
import { safeUrl } from './safe-url.ts';

// 통째로 지우는 요소 (소문자로 비교한다. svg 요소는 hast에서 대소문자가 섞여 있다)
const DROPPED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'object',
  'embed',
  'applet',
  'base',
  'meta',
  'link',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'frame',
  'frameset',
  'noembed',
  'noframes',
  'xmp',
  'plaintext',
  'title',
  'portal',
  'animate',
  'set',
  'animatemotion',
  'animatetransform',
  'handler',
  'listener',
]);

// 지우는 속성 (hast 속성 이름)
const DROPPED_PROPERTIES = new Set(['srcDoc', 'srcSet', 'httpEquiv', 'formAction', 'ping']);

// 주소를 담는 속성 (hast 속성 이름)
const URL_PROPERTIES = [
  'href',
  'src',
  'xLinkHref',
  'action',
  'poster',
  'cite',
  'background',
  'data',
  'codeBase',
  'longDesc',
  'manifest',
];

// 임베드 iframe으로 받는 주소 (embed-url.ts의 embedUrl 형식)
const EMBED_IFRAME_SRC =
  /^https:\/\/(?:www\.youtube-nocookie\.com|codesandbox\.io)\/embed\/[A-Za-z0-9_-]+$/;

// 속성을 정리한다: 이벤트·위험 속성을 빼고 주소에 safeUrl을 적용한다
function cleanProperties(properties: Properties): Properties {
  const result: Properties = {};
  for (const [name, value] of Object.entries(properties)) {
    if (/^on/i.test(name) || DROPPED_PROPERTIES.has(name)) continue;
    if (URL_PROPERTIES.includes(name)) {
      if (typeof value === 'string') result[name] = safeUrl(value.trim());
      continue;
    }
    result[name] = value;
  }
  return result;
}

// 임베드 iframe이면 안전한 속성만 남긴 새 속성을 돌려준다. 아니면 null
function embedIframeProperties(node: Element): Properties | null {
  const src = typeof node.properties.src === 'string' ? node.properties.src.trim() : '';
  if (!EMBED_IFRAME_SRC.test(src)) return null;
  const title = typeof node.properties.title === 'string' ? node.properties.title : '임베드';
  return {
    src,
    title,
    loading: 'lazy',
    sandbox: EMBED_IFRAME_SANDBOX.split(' '),
    referrerPolicy: EMBED_IFRAME_REFERRER_POLICY,
    allowFullScreen: true,
  };
}

export default function rehypeStripUnsafe() {
  return (tree: Root) => {
    visit(tree, 'element', (node, index, parent) => {
      const tag = node.tagName.toLowerCase();
      if (tag === 'iframe') {
        const properties = embedIframeProperties(node);
        if (properties) {
          node.properties = properties;
          node.children = [];
          return SKIP;
        }
      }
      if (tag === 'iframe' || DROPPED_TAGS.has(tag)) {
        if (parent && index !== undefined) {
          parent.children.splice(index, 1);
          return [SKIP, index];
        }
        return SKIP;
      }
      node.properties = cleanProperties(node.properties);
      return undefined;
    });
  };
}
