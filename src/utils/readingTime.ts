/**
 * 읽기 시간 계산 유틸리티
 * 평균 읽기 속도: 한국어/영어 혼합 기준 분당 약 200단어
 */

// 단어 수 계산 (한글 + 영어 모두 고려)
function countWords(text: string): number {
  // 마크다운 문법 제거
  const cleanText = text
    .replace(/```[\s\S]*?```/g, '') // 코드 블록 제거
    .replace(/`[^`]*`/g, '') // 인라인 코드 제거
    .replace(/!\[.*?\]\(.*?\)/g, '') // 이미지 제거
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 링크 텍스트만 유지
    .replace(/#{1,6}\s*/g, '') // 헤딩 마크 제거
    .replace(/[*_~]+/g, '') // 강조 마크 제거
    .replace(/>\s*/g, '') // 인용문 마크 제거
    .replace(/-{3,}/g, '') // 구분선 제거
    .replace(/\n+/g, ' ') // 줄바꿈을 공백으로
    .trim();

  // 영어 단어 수
  const englishWords = cleanText.match(/[a-zA-Z]+/g) || [];

  // 한글 글자 수 (한글은 글자당 약 0.5단어로 계산)
  const koreanChars = cleanText.match(/[가-힣]/g) || [];

  // 숫자 포함 단어
  const numberWords = cleanText.match(/\d+/g) || [];

  return englishWords.length + Math.ceil(koreanChars.length / 2) + numberWords.length;
}

// 읽기 시간 계산 (분 단위)
export function calculateReadingTime(content: string): number {
  const WORDS_PER_MINUTE = 200;
  const words = countWords(content);
  const minutes = Math.ceil(words / WORDS_PER_MINUTE);

  // 최소 1분
  return Math.max(1, minutes);
}

// 읽기 시간 포맷팅
export function formatReadingTime(minutes: number): string {
  if (minutes < 1) return '1분 미만';
  return `${minutes}분 읽기`;
}
