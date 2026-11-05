import { Timestamp } from 'firebase-admin/firestore';
import type { ContentPost } from '@/lib/content-posts';
import type { PublishPostInput } from '@/lib/markdown-publish';
import { getServerDb } from './firebase-server';
import { invalidateMemo, memoize } from './memo-cache';

// 글 데이터 메모리 캐시 키 접두사 (글 저장·삭제 시 이 접두사로 비운다)
const POSTS_MEMO_PREFIX = 'posts:';

type FirestorePostStatus = 'draft' | 'published';

type FirestorePostData = {
  slug?: string;
  title?: string;
  description?: string;
  content?: string;
  heroImage?: string;
  heroVideo?: string;
  tags?: string[];
  status?: FirestorePostStatus;
  isPublic?: boolean;
  readingTime?: number;
  pubDate?: Timestamp | Date | string;
  updatedDate?: Timestamp | Date | string;
  createdAt?: Timestamp | Date | string;
};

type UpsertFirestorePostInput = PublishPostInput & {
  originalSlug?: string;
};

function toDate(value: unknown, fallback: Date = new Date()) {
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function normalizeTags(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function buildContentPost(id: string, data: FirestorePostData): ContentPost {
  const pubDate = toDate(data.pubDate);
  const updatedDate = toDate(data.updatedDate, pubDate);
  const heroVideo = typeof data.heroVideo === 'string' ? data.heroVideo : undefined;
  const heroImage = heroVideo ? '' : typeof data.heroImage === 'string' ? data.heroImage : '';

  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    description: typeof data.description === 'string' ? data.description : '',
    content: typeof data.content === 'string' ? data.content : '',
    heroImage,
    heroVideo,
    tags: normalizeTags(data.tags),
    slug: typeof data.slug === 'string' ? data.slug : id,
    pubDate,
    updatedDate,
    readingTime: typeof data.readingTime === 'number' ? data.readingTime : 1,
    isPublic: data.isPublic !== false,
  };
}

async function findPostSnapshotBySlug(slug: string) {
  const db = getServerDb();
  const snapshot = await db.collection('posts').where('slug', '==', slug).limit(1).get();

  return snapshot.docs[0] ?? null;
}

// 공개 글 목록
// - 홈, 블로그, 시리즈 페이지가 한 요청 안에서 여러 번 부르므로 메모리 캐시로 한 번만 조회한다.
export async function listPublishedFirestorePosts(): Promise<ContentPost[]> {
  return memoize(`${POSTS_MEMO_PREFIX}list`, async () => {
    const db = getServerDb();
    const snapshot = await db.collection('posts').orderBy('pubDate', 'desc').get();

    return snapshot.docs
      .filter((docSnap) => {
        const data = docSnap.data() as FirestorePostData;
        return data.status === 'published' && data.isPublic !== false;
      })
      .map((docSnap) => buildContentPost(docSnap.id, docSnap.data() as FirestorePostData));
  });
}

export async function getFirestorePostBySlug(slug: string): Promise<ContentPost | null> {
  const snapshot = await findPostSnapshotBySlug(slug);
  if (!snapshot) return null;

  return buildContentPost(snapshot.id, snapshot.data() as FirestorePostData);
}

// 공개 글 하나 (글 상세 페이지용)
// - 예전에는 같은 slug를 두 번 조회했다. 이제 한 번 조회한 문서에서 상태까지 확인한다.
export async function getPublishedFirestorePostBySlug(slug: string): Promise<ContentPost | null> {
  return memoize(`${POSTS_MEMO_PREFIX}slug:${slug}`, async () => {
    const snapshot = await findPostSnapshotBySlug(slug);
    if (!snapshot) return null;

    const data = snapshot.data() as FirestorePostData;
    const post = buildContentPost(snapshot.id, data);
    if (!post.isPublic || data.status !== 'published') return null;
    return post;
  });
}

export async function upsertFirestorePost(input: UpsertFirestorePostInput) {
  const db = getServerDb();
  const targetSlug = input.originalSlug || input.slug;
  const existingSnapshot = await findPostSnapshotBySlug(targetSlug);
  const now = Timestamp.now();
  const existingData = existingSnapshot?.data() as FirestorePostData | undefined;
  const resolvedPubDate = input.pubDate
    ? toDate(input.pubDate)
    : existingData?.pubDate
      ? toDate(existingData.pubDate)
      : new Date();
  const baseData = {
    slug: input.slug,
    title: input.title,
    description: input.description,
    content: input.content,
    heroImage: input.heroImage || '',
    heroVideo: input.heroVideo || '',
    tags: input.tags,
    status: (input.isPublic ? 'published' : 'draft') as FirestorePostStatus,
    isPublic: input.isPublic === true,
    readingTime: input.readingTime,
    pubDate: Timestamp.fromDate(resolvedPubDate),
    updatedDate: Timestamp.fromDate(toDate(input.updatedDate)),
    updatedAt: now,
  };

  if (existingSnapshot) {
    await existingSnapshot.ref.update(baseData);
    // 저장 후 이 서버 인스턴스의 글 캐시를 비워 바로 새 내용을 보이게 한다
    invalidateMemo(POSTS_MEMO_PREFIX);

    return {
      id: existingSnapshot.id,
      slug: input.slug,
      created: false,
    };
  }

  const created = await db.collection('posts').add({
    ...baseData,
    createdAt: now,
  });
  invalidateMemo(POSTS_MEMO_PREFIX);

  return {
    id: created.id,
    slug: input.slug,
    created: true,
  };
}

export async function deleteFirestorePostBySlug(slug: string) {
  const snapshot = await findPostSnapshotBySlug(slug);
  if (!snapshot) {
    return { deleted: false };
  }

  await snapshot.ref.delete();
  invalidateMemo(POSTS_MEMO_PREFIX);
  return { deleted: true };
}
