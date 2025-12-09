// Firebase에서 블로그 포스트 가져오기
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

// URL이 동영상 파일인지 확인
const isVideoUrl = (url: string): boolean => {
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
};

// 마크다운 렌더링 문제 해결
// Milkdown 에디터와 remark-gfm 파싱 호환성 문제 수정
const fixMarkdown = (content: string): string => {
  if (!content) return '';
  let result = content
    // 1. 백슬래시 이스케이프 복원: \* → *, \_ → _
    .replace(/\\\*/g, '*')
    .replace(/\\_/g, '_');

  // 2. 반복적으로 ** 쌍을 <strong>으로 변환 (중첩 처리)
  // 가장 안쪽부터 변환하기 위해 반복
  let prevResult = '';
  while (prevResult !== result) {
    prevResult = result;
    // 가장 가까운 ** 쌍을 <strong>으로 변환
    result = result.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  }

  // 3. 짝이 맞지 않는 남은 ** 제거
  result = result.replace(/\*\*/g, '');

  // 4. 빈 <strong> 태그 제거
  result = result.replace(/<strong>\s*<\/strong>/g, '');

  return result;
};

export interface Post {
  id: string;
  title: string;
  description: string;
  content: string;
  heroImage: string;
  heroVideo?: string; // 자동재생 무한반복 동영상 (webm, mp4)
  tags: string[];
  slug: string;
  status: 'draft' | 'published';
  pubDate: Date;
  updatedDate: Date;
  readingTime: number;
  isPublic: boolean;
}

// 발행된 공개 포스트 목록 가져오기
// Firestore 규칙과 일치하도록 status 쿼리 포함, isPublic은 클라이언트 필터링
export async function getPublishedPosts(): Promise<Post[]> {
  const postsRef = collection(db, 'posts');
  // status='published' 쿼리는 Firestore 규칙과 일치해야 함
  const q = query(postsRef, where('status', '==', 'published'));
  const snapshot = await getDocs(q);

  return snapshot.docs
    .map((doc) => {
      const data = doc.data();
      const mediaUrl = data.heroImage || '';
      const isVideo = isVideoUrl(mediaUrl);

      return {
        id: doc.id,
        title: data.title || '',
        description: data.description || '',
        content: fixMarkdown(data.content || ''),
        // 동영상이면 heroImage는 비우고 heroVideo에 URL 저장
        heroImage: isVideo ? '' : mediaUrl,
        heroVideo: isVideo ? mediaUrl : (data.heroVideo || undefined),
        tags: data.tags || [],
        slug: data.slug || doc.id,
        status: data.status || 'draft',
        pubDate: data.pubDate?.toDate() || new Date(),
        updatedDate: data.updatedDate?.toDate() || new Date(),
        readingTime: data.readingTime || 0,
        isPublic: data.isPublic ?? true,
      };
    })
    .filter((post) => post.isPublic === true)
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}

// slug로 단일 포스트 가져오기
// Firestore 보안 규칙과 일치하도록 status 쿼리 포함
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const postsRef = collection(db, 'posts');
  // 보안 규칙이 status='published' 체크를 요구하므로 쿼리에 포함
  const q = query(
    postsRef,
    where('slug', '==', slug),
    where('status', '==', 'published')
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  const data = docSnap.data();

  // 공개 여부 클라이언트에서 추가 검증
  if (data.isPublic !== true) {
    return null;
  }

  const mediaUrl = data.heroImage || '';
  const isVideo = isVideoUrl(mediaUrl);

  return {
    id: docSnap.id,
    title: data.title || '',
    description: data.description || '',
    content: fixMarkdown(data.content || ''),
    // 동영상이면 heroImage는 비우고 heroVideo에 URL 저장
    heroImage: isVideo ? '' : mediaUrl,
    heroVideo: isVideo ? mediaUrl : (data.heroVideo || undefined),
    tags: data.tags || [],
    slug: data.slug || docSnap.id,
    status: data.status || 'draft',
    pubDate: data.pubDate?.toDate() || new Date(),
    updatedDate: data.updatedDate?.toDate() || new Date(),
    readingTime: data.readingTime || 0,
    isPublic: data.isPublic ?? true,
  };
}

// 모든 태그 가져오기
export async function getAllTags(): Promise<string[]> {
  const posts = await getPublishedPosts();
  const tags = new Set<string>();
  posts.forEach((post) => {
    post.tags.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort();
}
