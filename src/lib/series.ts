// 시리즈 기능 - Firestore 시리즈 + Markdown 포스트 연동
import { collection, getDocs, getDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import { getPublishedContentPosts } from './content-posts';

/**
 * 시리즈 인터페이스
 * 여러 포스트를 순서대로 묶는 컬렉션
 */
export interface Series {
  id: string;              // Firestore 문서 ID
  name: string;            // 시리즈 이름 (예: "Pintos 운영체제 구현")
  slug: string;            // URL용 슬러그 (예: "pintos-os")
  description: string;     // 시리즈 소개글
  coverImage?: string;     // 시리즈 대표 이미지 (선택사항)
  postIds: string[];       // 순서대로 정렬된 포스트 문서 ID 또는 slug 배열
  postCount: number;       // 전체 글 수 (캐시)
  createdAt: Date;         // 생성일
  updatedAt: Date;         // 최종 수정일
  isPublic: boolean;       // 공개 여부
  order: number;           // 시리즈 목록에서의 순서 (낮을수록 먼저 표시)
}

/**
 * 시리즈 내 포스트 정보
 * 시리즈 상세 페이지에서 사용
 */
export interface SeriesPost {
  id: string;
  title: string;
  description: string;
  slug: string;
  pubDate: Date;
  readingTime: number;
  order: number;           // 시리즈 내 순서
}

function buildSeries(id: string, data: Record<string, unknown>): Series {
  const postIds = Array.isArray(data.postIds) ? data.postIds.filter(Boolean) : [];

  return {
    id,
    name: data.name || '',
    slug: data.slug || id,
    description: data.description || '',
    coverImage: data.coverImage || undefined,
    postIds,
    postCount: data.postCount || postIds.length || 0,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || data.updatedDate?.toDate() || new Date(),
    isPublic: data.isPublic ?? false,
    order: data.order ?? 999,
  };
}

function mapSeriesDoc(docSnap: Awaited<ReturnType<typeof getDocs>>['docs'][number]): Series {
  return buildSeries(docSnap.id, docSnap.data());
}

/**
 * 발행된 공개 시리즈 목록 가져오기
 * 시리즈 목록 페이지(/series)에서 사용
 */
export async function getPublishedSeries(): Promise<Series[]> {
  const seriesRef = collection(db, 'series');
  const q = query(
    seriesRef,
    where('isPublic', '==', true),
    orderBy('order', 'asc'),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map(mapSeriesDoc);
}

/**
 * slug로 단일 시리즈 가져오기
 * 시리즈 상세 페이지(/series/[slug])에서 사용
 */
export async function getSeriesBySlug(slug: string): Promise<Series | null> {
  const seriesRef = collection(db, 'series');
  const q = query(
    seriesRef,
    where('slug', '==', slug),
    where('isPublic', '==', true)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  return mapSeriesDoc(snapshot.docs[0]);
}

/**
 * 시리즈 ID로 시리즈에 속한 포스트 목록 가져오기
 * Firestore 시리즈 문서의 postIds 순서를 그대로 따른다.
 * 과거 데이터는 문서 ID, 최근 데이터는 slug를 들고 있을 수 있어서 둘 다 지원한다.
 */
export async function getPostsBySeries(seriesId: string): Promise<SeriesPost[]> {
  const seriesRef = doc(db, 'series', seriesId);
  const seriesSnap = await getDoc(seriesRef);

  if (!seriesSnap.exists()) return [];

  const series = buildSeries(seriesSnap.id, seriesSnap.data());

  if (series.postIds.length === 0) return [];

  const contentPosts = await getPublishedContentPosts();
  const postMapById = new Map(contentPosts.map((post) => [post.id, post] as const));
  const postMapBySlug = new Map(contentPosts.map((post) => [post.slug, post] as const));

  return series.postIds
    .map((postRef, index) => {
      const post = postMapById.get(postRef) || postMapBySlug.get(postRef);

      if (!post) return null;

      return {
        id: post.id,
        title: post.title,
        description: post.description,
        slug: post.slug,
        pubDate: post.pubDate,
        readingTime: post.readingTime,
        order: index + 1,
      };
    })
    .filter((post): post is SeriesPost => post !== null);
}

/**
 * 포스트 문서 ID 또는 slug가 속한 시리즈 정보 가져오기
 * 포스트 상세 페이지에서 시리즈 위젯 표시용
 */
export async function getSeriesByPostId(postId: string): Promise<Series | null> {
  const [seriesList, contentPosts] = await Promise.all([
    getPublishedSeries(),
    getPublishedContentPosts(),
  ]);
  const matchedPost = contentPosts.find((post) => post.id === postId || post.slug === postId);
  const candidateRefs = new Set([postId, matchedPost?.id, matchedPost?.slug].filter(Boolean));

  return seriesList.find((series) => series.postIds.some((ref) => candidateRefs.has(ref))) || null;
}

/**
 * 시리즈 내에서 이전/다음 포스트 찾기
 * 포스트 상세 페이지의 네비게이션용
 */
export async function getAdjacentPostsInSeries(
  postId: string,
  seriesId: string
): Promise<{ prev: SeriesPost | null; next: SeriesPost | null }> {
  const posts = await getPostsBySeries(seriesId);
  const currentIndex = posts.findIndex((p) => p.id === postId || p.slug === postId);

  if (currentIndex === -1) {
    return { prev: null, next: null };
  }

  return {
    prev: currentIndex > 0 ? posts[currentIndex - 1] : null,
    next: currentIndex < posts.length - 1 ? posts[currentIndex + 1] : null,
  };
}

/**
 * 시리즈의 총 읽기 시간 계산
 * 시리즈 카드에서 표시용
 */
export async function getSeriesReadingTime(seriesId: string): Promise<number> {
  const posts = await getPostsBySeries(seriesId);
  return posts.reduce((total, post) => total + post.readingTime, 0);
}
