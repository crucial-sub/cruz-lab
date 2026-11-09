// 글 본문 렌더 캐시 테스트 (재건 4단계 D7, 리뷰 경미 7)
import { beforeEach, describe, expect, it, vi } from 'vitest';

const BUCKET = 'cruz-lab.firebasestorage.app';
const getAssetsByIds = vi.fn();

vi.mock('@/lib/server/entries', () => ({
  getAssetsByIds: (ids: string[]) => getAssetsByIds(ids),
}));
vi.mock('@/lib/server/firebase-server', () => ({ getStorageBucketName: () => BUCKET }));

const { assetIdsInMarkdown, clearRenderCache, renderEntry } = await import(
  '@/lib/server/render-entry'
);

const url = (path: string, bucket = BUCKET) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media&token=t`;

beforeEach(() => {
  clearRenderCache();
  getAssetsByIds.mockReset();
  getAssetsByIds.mockResolvedValue(new Map());
});

describe('assetIdsInMarkdown', () => {
  it('우리 버킷의 assets/{id}만, 나온 순서, 중복 없이', () => {
    const markdown = [
      `![a](${url('assets/b2/max.webp')})`,
      `![b](${url('assets/a1/w480.webp')})`,
      `![c](${url('assets/b2/w960.webp')})`,
      `![d](${url('images/old.png')})`,
      `![e](${url('assets/zz/max.webp', 'other-bucket')})`,
      '![f](https://user-images.githubusercontent.com/1/a.png)',
    ].join('\n\n');
    expect(assetIdsInMarkdown(markdown, BUCKET)).toEqual(['b2', 'a1']);
  });
});

describe('renderEntry', () => {
  it('같은 글·같은 발행본이면 한 번만 그린다', async () => {
    const entry = {
      id: 'p1',
      revision: 1,
      markdown: `## 제목\n\n![a](${url('assets/a1/max.webp')})`,
    };
    const first = await renderEntry(entry);
    const second = await renderEntry(entry);
    expect(second).toBe(first);
    expect(getAssetsByIds).toHaveBeenCalledTimes(1);
    expect(getAssetsByIds).toHaveBeenCalledWith(['a1']);
    expect(first.toc).toEqual([{ depth: 2, id: '제목', text: '제목' }]);
  });

  it('발행본 번호가 바뀌면 다시 그리고 글마다 최신 하나만 둔다', async () => {
    const first = await renderEntry({ id: 'p1', revision: 1, markdown: '## 하나' });
    const second = await renderEntry({ id: 'p1', revision: 2, markdown: '## 둘' });
    expect(second).not.toBe(first);
    expect(second.toc[0].text).toBe('둘');
    const third = await renderEntry({ id: 'p1', revision: 2, markdown: '## 둘' });
    expect(third).toBe(second);
  });

  it('자산 조회가 실패해도 글은 그린다 (srcset만 빠진다)', async () => {
    getAssetsByIds.mockRejectedValue(new Error('일시 오류'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await renderEntry({
      id: 'p2',
      revision: 1,
      markdown: `![a](${url('assets/a1/max.webp')})`,
    });
    expect(result.html).toContain('<img');
    expect(result.html).not.toContain('srcset');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('하이라이트한 코드와 수식 여부를 돌려준다', async () => {
    const result = await renderEntry({
      id: 'p3',
      revision: 1,
      markdown: '```js\nconst a = 1;\n```\n\n$x$',
    });
    expect(result.html).toContain('class="shiki');
    expect(result.hasMath).toBe(true);
  });
});
