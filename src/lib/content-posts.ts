import {
  getPublishedFirestorePostBySlug,
  listPublishedFirestorePosts,
} from '@/lib/server/firestore-posts';

export interface ContentPost {
  id: string;
  title: string;
  description: string;
  content: string;
  heroImage: string;
  heroVideo?: string;
  tags: string[];
  slug: string;
  pubDate: Date;
  updatedDate: Date;
  readingTime: number;
  isPublic: boolean;
}

export async function getPublishedContentPosts(): Promise<ContentPost[]> {
  return listPublishedFirestorePosts();
}

export async function getContentPostBySlug(slug: string): Promise<ContentPost | null> {
  return getPublishedFirestorePostBySlug(slug);
}

export async function getAllContentTags(): Promise<string[]> {
  const posts = await getPublishedContentPosts();
  return Array.from(new Set(posts.flatMap((post) => post.tags))).sort();
}
