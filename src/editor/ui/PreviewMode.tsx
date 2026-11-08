// 미리보기 모드 (재건 3단계 D8)
// - 공유 파이프라인 markdownToHtml()의 결과를 공개 페이지와 같은 .prose 안에 넣는다(콜아웃·임베드·수식·하이라이트 포함).
// - 공개 페이지 렌더(react-markdown)는 4단계까지 그대로다. 여기서는 같은 토큰·클래스만 맞춘다.

import { useMemo } from 'react';
import { markdownToHtml } from '@/lib/content/markdown';

export function PreviewMode({ markdown }: { markdown: string }) {
  const html = useMemo(() => {
    try {
      return markdownToHtml(markdown);
    } catch (error) {
      return `<p class="text-red-400">미리보기를 만들지 못했습니다: ${error instanceof Error ? error.message : String(error)}</p>`;
    }
  }, [markdown]);

  // 관리자 본인의 글이다. 공개 페이지도 같은 원시 HTML(rehype-raw)을 그린다
  return (
    <div
      className="prose prose-lg max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
