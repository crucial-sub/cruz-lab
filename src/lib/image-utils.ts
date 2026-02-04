// 이미지 최적화 유틸리티
// Firebase Storage URL에서 srcset 생성 및 LQIP 처리

/**
 * 이미지 URL에서 다양한 너비의 srcset 생성
 * Firebase Storage는 width 파라미터를 지원하지 않으므로
 * Vercel Image Optimization 또는 원본 URL 사용
 */
export function generateSrcSet(
  src: string,
  widths: number[] = [400, 800, 1200]
): string {
  // Firebase Storage URL인 경우 원본 반환 (Vercel에서 자동 최적화)
  if (src.includes('firebasestorage.googleapis.com')) {
    return widths.map((w) => `${src} ${w}w`).join(', ');
  }

  // 로컬 이미지는 Astro Image Optimization 사용
  return widths.map((w) => `${src}?w=${w} ${w}w`).join(', ');
}

/**
 * 반응형 sizes 속성 생성
 * 일반적인 카드 그리드 레이아웃에 최적화
 */
export function getDefaultSizes(): string {
  return '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
}

/**
 * 이미지가 동영상 확장자인지 확인
 */
export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
}

/**
 * LQIP (Low Quality Image Placeholder) base64 데이터를 배경 스타일로 변환
 */
export function getBlurStyle(blurDataURL?: string): React.CSSProperties {
  if (!blurDataURL) return {};
  return {
    backgroundImage: `url(${blurDataURL})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}
