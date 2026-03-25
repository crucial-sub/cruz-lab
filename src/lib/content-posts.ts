import { getCollection, type CollectionEntry } from 'astro:content';
import { calculateReadingTime } from '@/utils/readingTime';

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

function isVideoUrl(url?: string): boolean {
  if (!url) return false;
  return /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url);
}

export function mapEntryToContentPost(entry: CollectionEntry<'blog'>): ContentPost {
  const mediaUrl = entry.data.heroVideo || entry.data.heroImage || '';
  const heroVideo = entry.data.heroVideo || (isVideoUrl(mediaUrl) ? mediaUrl : undefined);
  const heroImage = heroVideo ? '' : mediaUrl;

  return {
    id: entry.data.slug || entry.id,
    title: entry.data.title,
    description: entry.data.description,
    content: entry.body,
    heroImage,
    heroVideo,
    tags: entry.data.tags,
    slug: entry.data.slug || entry.id,
    pubDate: entry.data.pubDate,
    updatedDate: entry.data.updatedDate || entry.data.pubDate,
    readingTime: entry.data.readingTime || calculateReadingTime(entry.body || ''),
    isPublic: entry.data.isPublic ?? true,
  };
}

export async function getPublishedContentPosts(): Promise<ContentPost[]> {
  const entries = await getCollection('blog', ({ data }) => data.isPublic !== false);

  return entries
    .map(mapEntryToContentPost)
    .sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
}

export async function getContentPostBySlug(slug: string): Promise<ContentPost | null> {
  const entries = await getCollection('blog', ({ data }) => data.isPublic !== false);
  const entry = entries.find((item) => (item.data.slug || item.id) === slug);
  return entry ? mapEntryToContentPost(entry) : null;
}

export async function getAllContentTags(): Promise<string[]> {
  const posts = await getPublishedContentPosts();
  return Array.from(new Set(posts.flatMap((post) => post.tags))).sort();
}
