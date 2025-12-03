// Firebase에서 블로그 포스트 가져오기
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';

export interface Post {
  id: string;
  title: string;
  description: string;
  content: string;
  heroImage: string;
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
      return {
        id: doc.id,
        title: data.title || '',
        description: data.description || '',
        content: data.content || '',
        heroImage: data.heroImage || '',
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
// 복합 인덱스 없이 slug로만 조회 후 클라이언트에서 검증
export async function getPostBySlug(slug: string): Promise<Post | null> {
  const postsRef = collection(db, 'posts');
  const q = query(postsRef, where('slug', '==', slug));

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  const data = docSnap.data();

  // 발행 상태 및 공개 여부 확인
  if (data.status !== 'published' || data.isPublic !== true) {
    return null;
  }

  return {
    id: docSnap.id,
    title: data.title || '',
    description: data.description || '',
    content: data.content || '',
    heroImage: data.heroImage || '',
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
