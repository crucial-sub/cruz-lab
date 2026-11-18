// "서가에 올리기"가 Finder 선택을 쓸지 정한다 (서가 1단계 T9, Plan J19)
// - Raycast를 열기 직전 맨 앞 앱이 Finder일 때만 Finder 선택을 쓴다.
// - 이유(사용자 확인 2026-11-18): getSelectedFinderItems는 Finder가 뒤에 있어도 Finder 창에 남은 선택을 돌려준다.
//   그래서 크롬을 쓰다가 명령을 열면, 전에 골라 둔 문서가 바로 올라갔다.
// - 읽지 못하면 빈 목록이다. 그러면 명령은 파일 고르기 칸을 연다.
// - @raycast/api를 가져오지 않는다. 명령이 Raycast 함수를 넘긴다(루트 vitest가 시험한다).

export const FINDER_BUNDLE_ID = 'com.apple.finder';

export interface FinderDeps {
  frontmostBundleId: () => Promise<string | undefined>; // Raycast를 열기 직전 맨 앞 앱
  selectedPaths: () => Promise<string[]>; // Finder에서 고른 경로
}

export async function finderSelectionIfFrontmost(deps: FinderDeps): Promise<string[]> {
  try {
    if ((await deps.frontmostBundleId()) !== FINDER_BUNDLE_ID) return [];
    return await deps.selectedPaths();
  } catch {
    return [];
  }
}
