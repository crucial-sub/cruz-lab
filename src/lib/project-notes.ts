import type { CollectionEntry } from 'astro:content';

type ProjectPostEntry = CollectionEntry<'projectPosts'>;

export function sortProjectPosts<T extends ProjectPostEntry>(posts: T[]): T[] {
  return [...posts].sort((a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id));
}

export function getPublishedProjectPosts<T extends ProjectPostEntry>(posts: T[]): T[] {
  return sortProjectPosts(posts.filter((post) => post.data.status === 'published'));
}

export function getProjectPosts<T extends ProjectPostEntry>(posts: T[], projectId: string): T[] {
  return getPublishedProjectPosts(posts).filter((post) => post.data.project === projectId);
}

export function getProjectEntryPost<T extends ProjectPostEntry>(
  posts: T[],
  projectId: string,
): T | null {
  return getProjectPosts(posts, projectId)[0] ?? null;
}

export function getProjectHref(posts: ProjectPostEntry[], projectId: string): string {
  const entryPost = getProjectEntryPost(posts, projectId);
  return entryPost ? `/projects/${projectId}/notes/${entryPost.id}` : `/projects/${projectId}`;
}
