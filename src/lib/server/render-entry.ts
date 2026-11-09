// 글 본문 렌더 (재건 4단계 D7)
// - 요청 때 공유 파이프라인(markdownToHtml)으로 그린다. 발행 때 미리 계산해 저장하지 않는다.
// - 결과는 글마다 하나를 메모리에 둔다. 키는 (글 ID, 발행본 번호)다. 재발행하면 번호가 바뀌어 다시 그린다.
//   자산 문서(srcset)가 바뀌는 경우를 위해 10분이 지나면 다시 그린다.
// - 캐시는 글 ID마다 최신 번호 하나만 가진다. 그래서 메모리는 발행 글 수에 묶인다.
// - CDN이 응답을 60초 저장하므로(cache-headers.ts) 같은 인스턴스가 같은 글을 다시 그리는 일은 드물다.
// - /notes 스트림은 id 접두사(idPrefix)를 붙여 그린다. 접두사가 다르면 다른 칸이다(노트 상세와 스트림이 한 칸씩).

import { extractStoragePaths, assetIdFromAssetPath } from '@/lib/asset-url';
import { getSiteHighlighter } from '@/lib/content/highlighter';
import { renderMarkdown, type MarkdownRenderResult } from '@/lib/content/markdown';
import { getAssetsByIds } from './entries';
import { getStorageBucketName } from './firebase-server';

// 렌더 결과 유지 시간
export const RENDER_CACHE_TTL_MS = 10 * 60_000;

export interface RenderableEntry {
  id: string;
  revision: number;
  markdown: string;
}

interface RenderCacheEntry {
  revision: number;
  expiresAt: number;
  promise: Promise<MarkdownRenderResult>;
}

const cache = new Map<string, RenderCacheEntry>();

// 본문의 새 자산 ID (우리 버킷의 assets/{id}/… 주소만, 나온 순서, 중복 없음)
export function assetIdsInMarkdown(markdown: string, bucket: string): string[] {
  const ids: string[] = [];
  for (const path of extractStoragePaths(markdown, bucket)) {
    const id = assetIdFromAssetPath(path);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

// 본문 자산의 변형. 조회가 실패하면 빈 맵이다(srcset만 빠지고 글은 그린다. 4단계 리뷰 경미 7)
async function loadAssets(ids: string[]) {
  try {
    return await getAssetsByIds(ids);
  } catch (error) {
    console.warn('자산 조회 실패, srcset 없이 그린다', ids, error);
    return new Map();
  }
}

export interface RenderEntryOptions {
  // 문서 안 id 접두사 (한 페이지에 본문 여러 개를 그릴 때)
  idPrefix?: string;
}

// 실제 렌더: 자산 조회 → 공유 파이프라인(Shiki + srcset)
async function renderNow(entry: RenderableEntry, options: RenderEntryOptions): Promise<MarkdownRenderResult> {
  const bucket = getStorageBucketName();
  const ids = assetIdsInMarkdown(entry.markdown, bucket);
  const byId = await loadAssets(ids);
  return renderMarkdown(entry.markdown, {
    highlighter: getSiteHighlighter(),
    assets: { byId, bucket },
    idPrefix: options.idPrefix,
  });
}

// 글 본문 → { html, toc, hasMath }. 같은 글·같은 발행본(·같은 접두사)이면 메모리 결과를 쓴다
export function renderEntry(
  entry: RenderableEntry,
  options: RenderEntryOptions = {},
): Promise<MarkdownRenderResult> {
  const key = options.idPrefix ? `${entry.id}\u0000${options.idPrefix}` : entry.id;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.revision === entry.revision && hit.expiresAt > now) return hit.promise;

  const promise = renderNow(entry, options).catch((error: unknown) => {
    // 실패한 결과는 남기지 않는다. 다음 요청이 다시 그린다
    if (cache.get(key)?.promise === promise) cache.delete(key);
    throw error;
  });
  cache.set(key, { revision: entry.revision, expiresAt: now + RENDER_CACHE_TTL_MS, promise });
  return promise;
}

// 테스트·운영 도구용: 렌더 캐시를 비운다
export function clearRenderCache() {
  cache.clear();
}
