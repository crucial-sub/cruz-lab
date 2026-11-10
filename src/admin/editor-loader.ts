// 에디터 모듈 늦게 받기 (재건 5단계 D9)
// - 에디터(EditorApp, KaTeX·Tiptap 포함)는 첫 진입 때만 받는다. 목록만 보면 받지 않는다.
// - 이어 쓰기 칸에 마우스를 올리거나 새 글을 만들 때 미리 받는다(Plan 11절).

export const loadEditor = () => import('@/editor/ui/EditorApp');

let preload: Promise<unknown> | null = null;

export function preloadEditor(): void {
  preload ??= loadEditor().catch(() => {
    // 실패하면 다음에 다시 받는다
    preload = null;
  });
}
