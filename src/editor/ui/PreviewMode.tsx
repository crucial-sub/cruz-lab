// 미리보기 모드 (재건 3단계 D8, 4단계 D8)
// - 공유 파이프라인 markdownToHtml()의 결과를 공개 글 상세와 같은 .prose 안에 넣는다(콜아웃·임베드·수식·코드 틀 포함).
//   .prose 규칙은 src/styles/prose.css 한 파일이다(editor.css가 가져온다).
// - 코드 하이라이트(Shiki)는 미리보기에 처음 들어올 때 import()로 받는다. 관리자만 받는 별도 청크다.
//   받기 전에는 민무늬로 그리고, 받으면 다시 그린다. 한 번 받으면 페이지를 떠날 때까지 다시 쓴다.

import { useEffect, useMemo, useState } from 'react';
import { markdownToHtml, type CodeHighlighter } from '@/lib/content/markdown';

// 오류 문구를 HTML 글자로 바꾼다
function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// 이 페이지에서 한 번만 받는다
let loadedHighlighter: CodeHighlighter | null = null;
let loadingHighlighter: Promise<CodeHighlighter> | null = null;

function loadHighlighter(): Promise<CodeHighlighter> {
  loadingHighlighter ??= import('@/lib/content/highlighter')
    .then((module) => {
      loadedHighlighter = module.createSiteHighlighter();
      return loadedHighlighter;
    })
    .catch((error: unknown) => {
      // 실패하면 다음 진입 때 다시 받는다. 그동안 코드는 민무늬다
      loadingHighlighter = null;
      throw error;
    });
  return loadingHighlighter;
}

export function PreviewMode({ markdown }: { markdown: string }) {
  const [highlighter, setHighlighter] = useState<CodeHighlighter | null>(loadedHighlighter);

  useEffect(() => {
    if (highlighter) return undefined;
    let active = true;
    loadHighlighter()
      .then((loaded) => {
        if (active) setHighlighter(loaded);
      })
      .catch((error: unknown) => {
        console.warn('미리보기 코드 하이라이트를 받지 못했습니다', error);
      });
    return () => {
      active = false;
    };
  }, [highlighter]);

  const html = useMemo(() => {
    try {
      return markdownToHtml(markdown, highlighter ? { highlighter } : {});
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 오류 문구에 꺾쇠가 있을 수 있다(innerHTML로 들어간다). 글자로 보이게 이스케이프한다
      return `<p class="text-red-400">미리보기를 만들지 못했습니다: ${escapeHtml(message)}</p>`;
    }
  }, [markdown, highlighter]);

  // 관리자 본인의 글이다. 공유 파이프라인이 원시 HTML을 안전 처리한다(rehype-strip-unsafe)
  return (
    <div
      className="prose prose-lg max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
