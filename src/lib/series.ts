// 시리즈 기능 - Firestore 연동
import { collection, getDocs, getDoc, doc, query, where, orderBy } from 'firebase/firestore';
import { db } from './firebase';
import type { Post } from './posts';

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
  postIds: string[];       // 순서대로 정렬된 포스트 ID 배열
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

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || '',
      slug: data.slug || doc.id,
      description: data.description || '',
      coverImage: data.coverImage || undefined,
      postIds: data.postIds || [],
      postCount: data.postCount || 0,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedDate?.toDate() || new Date(),
      isPublic: data.isPublic ?? false,
      order: data.order ?? 999,
    };
  });
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

  const docSnap = snapshot.docs[0];
  const data = docSnap.data();

  return {
    id: docSnap.id,
    name: data.name || '',
    slug: data.slug || docSnap.id,
    description: data.description || '',
    coverImage: data.coverImage || undefined,
    postIds: data.postIds || [],
    postCount: data.postCount || 0,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedDate?.toDate() || new Date(),
    isPublic: data.isPublic ?? false,
    order: data.order ?? 999,
  };
}

/**
 * 시리즈 ID로 시리즈에 속한 포스트 목록 가져오기
 * 포스트는 seriesOrder 순서대로 정렬됨
 */
export async function getPostsBySeries(seriesId: string): Promise<SeriesPost[]> {
  const postsRef = collection(db, 'posts');
  const q = query(
    postsRef,
    where('seriesId', '==', seriesId),
    where('status', '==', 'published'),
    where('isPublic', '==', true),
    orderBy('seriesOrder', 'asc')
  );

  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      title: data.title || '',
      description: data.description || '',
      slug: data.slug || doc.id,
      pubDate: data.pubDate?.toDate() || new Date(),
      readingTime: data.readingTime || 0,
      order: data.seriesOrder || 0,
    };
  });
}

/**
 * 포스트가 속한 시리즈 정보 가져오기
 * 포스트 상세 페이지에서 시리즈 위젯 표시용
 */
export async function getSeriesByPostId(postId: string): Promise<Series | null> {
  // 먼저 포스트 문서에서 seriesId 가져오기
  const postRef = doc(db, 'posts', postId);
  const postSnap = await getDoc(postRef);

  if (!postSnap.exists()) return null;

  const postData = postSnap.data();
  const seriesId = postData.seriesId;

  if (!seriesId) return null;

  // seriesId로 시리즈 정보 가져오기
  const seriesRef = doc(db, 'series', seriesId);
  const seriesSnap = await getDoc(seriesRef);

  if (!seriesSnap.exists()) return null;

  const data = seriesSnap.data();

  return {
    id: seriesSnap.id,
    name: data.name || '',
    slug: data.slug || seriesSnap.id,
    description: data.description || '',
    coverImage: data.coverImage || undefined,
    postIds: data.postIds || [],
    postCount: data.postCount || 0,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedDate?.toDate() || new Date(),
    isPublic: data.isPublic ?? false,
    order: data.order ?? 999,
  };
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
  const currentIndex = posts.findIndex(p => p.id === postId);

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
