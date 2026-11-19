// 공유 파이프라인의 링크 주소 바꾸기 옵션 테스트 (서가 2단계 Plan J29)
// - 옵션이 없으면 결과가 지금과 같다(블로그 렌더 결과가 바뀌지 않는다, C15).
// - 옵션이 있으면 링크(a)의 주소만 바꾼다. 그림은 바꾸지 않는다(그림은 mediaUrl).
// - 바꾸기 함수가 null을 주면 그대로 둔다. 안전 처리(safeUrl)가 지운 위험 주소는 넘기지 않는다.
import { describe, expect, it } from 'vitest';
import { markdownToHtml } from '@/lib/content/markdown';

// .md 링크만 바꾸는 가짜 바꾸기 함수
const mdOnly = (url: string) => (/\.md(#|$)/.test(url) ? `/admin/library/d/x?ref=${encodeURIComponent(url)}` : null);

describe('linkUrl 옵션이 없을 때 (블로그)', () => {
  it('링크 주소가 그대로다', () => {
    expect(markdownToHtml('[b](./b.md)')).toBe('<p><a href="./b.md">b</a></p>');
  });
});

describe('linkUrl 옵션이 있을 때 (서가 md 뷰어)', () => {
  it('md 링크와 md 안의 <a> 태그 주소를 바꾼다', () => {
    const html = markdownToHtml('[b](./b.md) <a href="c.md">c</a>', { linkUrl: { rewrite: mdOnly } });
    expect(html).toContain('<a href="/admin/library/d/x?ref=.%2Fb.md">b</a>');
    expect(html).toContain('<a href="/admin/library/d/x?ref=c.md">c</a>');
  });

  it('바꾸기 함수가 null을 주면 그대로 둔다. 바깥 링크의 새 창 속성도 그대로다', () => {
    const html = markdownToHtml('[e](https://example.com/a)', { linkUrl: { rewrite: mdOnly } });
    expect(html).toBe('<p><a href="https://example.com/a" target="_blank" rel="noopener noreferrer">e</a></p>');
  });

  it('그림 주소는 바꾸지 않는다', () => {
    const html = markdownToHtml('![a](a.md)', { linkUrl: { rewrite: () => '/바뀜' } });
    expect(html).toContain('src="a.md"');
  });

  it('안전 처리가 지운 위험 주소는 바꾸기 함수에 넘기지 않는다', () => {
    const seen: string[] = [];
    markdownToHtml('[x](javascript:alert(1))', {
      linkUrl: {
        rewrite: (url) => {
          seen.push(url);
          return null;
        },
      },
    });
    expect(seen).toEqual([]);
  });

  it('제목 앵커(#id)도 바꾸기 함수를 거친다. null이면 그대로다', () => {
    const html = markdownToHtml('## 제목', { linkUrl: { rewrite: (url) => (url.startsWith('#') ? null : '/x') } });
    expect(html).not.toContain('/x');
  });
});
