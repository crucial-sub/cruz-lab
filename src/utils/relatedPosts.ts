/**
 * 관련 포스트 찾기 유틸리티
 * 태그 기반으로 유사한 포스트를 추천
 */
import { calculateReadingTime } from './readingTime';

interface ContentPost {
  id: string;
  data: {
    title: string;
    description: string;
    pubDate: Date;
    heroImage?: { src: string };
    tags: string[];
  };
  body?: string;
}

interface RelatedPost {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  heroImage?: string;
  tags: string[];
  readingTime: number;
}

/**
 * 현재 포스트와 태그가 유사한 포스트들을 찾아 반환
 * @param currentPost 현재 포스트
 * @param allPosts 모든 포스트 목록
 * @param maxCount 반환할 최대 포스트 수
 */
export function findRelatedPosts(
  currentPost: ContentPost,
  allPosts: ContentPost[],
  maxCount: number = 3
): RelatedPost[] {
  const currentTags = currentPost.data.tags || [];

  // 현재 포스트 제외하고 태그 유사도 계산
  const scoredPosts = allPosts
    .filter((p) => p.id !== currentPost.id)
    .map((p) => {
      const postTags = p.data.tags || [];
      const commonTags = currentTags.filter((tag) => postTags.includes(tag));
      return {
        post: p,
        score: commonTags.length,
      };
    })
    .filter((item) => item.score > 0) // 공통 태그가 있는 것만
    .sort((a, b) => b.score - a.score) // 점수 높은 순
    .slice(0, maxCount);

  return scoredPosts.map((item) => ({
    slug: item.post.id,
    title: item.post.data.title,
    description: item.post.data.description,
    pubDate: item.post.data.pubDate.toISOString(),
    heroImage: item.post.data.heroImage?.src,
    tags: item.post.data.tags || [],
    readingTime: calculateReadingTime(item.post.body || ''),
  }));
}
