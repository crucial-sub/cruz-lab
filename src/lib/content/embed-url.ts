// 임베드 주소 판정 (재건 3단계 D3·D10)
// - YouTube와 CodeSandbox 두 제공자만 받는다. 그 밖 주소는 null이다.
// - 에디터(embed 노드), 변환기, 공유 파이프라인(remark-embed)이 같은 함수를 쓴다.
// - 순수 함수다. 브라우저와 Node에서 같이 돈다.

export type EmbedProvider = 'youtube' | 'codesandbox';

export interface EmbedInfo {
  provider: EmbedProvider;
  id: string;
  // 원래 주소 (마크다운에 그대로 남는다)
  url: string;
  // iframe src (허용 호스트 2개 중 하나)
  embedUrl: string;
}

// iframe 보안 속성 (Plan 11절)
export const EMBED_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-presentation';
export const EMBED_IFRAME_REFERRER_POLICY = 'strict-origin';

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);
const CODESANDBOX_ID = /^[A-Za-z0-9_-]+$/;

// http(s) 주소만 URL로 읽는다. 그 밖은 null
function parseHttpUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url : null;
}

// YouTube 영상 ID: youtu.be/<id>, youtube.com/watch?v=<id>, youtube.com/shorts/<id>
function youtubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  if (host === 'youtu.be') return segments[0] ?? null;
  if (!YOUTUBE_HOSTS.has(host)) return null;
  if (segments[0] === 'watch') return url.searchParams.get('v');
  if (
    (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live') &&
    segments[1]
  )
    return segments[1];
  return null;
}

// CodeSandbox ID: codesandbox.io/s/<id>, /embed/<id>, /p/sandbox/<id>, /p/devbox/<id>
function codesandboxId(url: URL): string | null {
  if (url.hostname.toLowerCase() !== 'codesandbox.io') return null;
  const segments = url.pathname.split('/').filter(Boolean);
  if ((segments[0] === 's' || segments[0] === 'embed') && segments[1]) return segments[1];
  if (segments[0] === 'p') return (segments.length >= 3 ? segments[2] : segments[1]) ?? null;
  return null;
}

// 주소가 지원 임베드이면 제공자·ID·iframe 주소를 돌려준다. 아니면 null
export function detectEmbed(value: string): EmbedInfo | null {
  const trimmed = value.trim();
  const url = parseHttpUrl(trimmed);
  if (!url) return null;

  const youtube = youtubeId(url);
  if (youtube && YOUTUBE_ID.test(youtube)) {
    return {
      provider: 'youtube',
      id: youtube,
      url: trimmed,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtube}`,
    };
  }

  const sandbox = codesandboxId(url);
  if (sandbox && CODESANDBOX_ID.test(sandbox)) {
    return {
      provider: 'codesandbox',
      id: sandbox,
      url: trimmed,
      embedUrl: `https://codesandbox.io/embed/${sandbox}`,
    };
  }

  return null;
}
