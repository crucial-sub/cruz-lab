import type { CollectionEntry } from 'astro:content';

type ProjectEntry = CollectionEntry<'projects'>;
export type ProjectMetaEntry = ProjectEntry & {
  data: Extract<ProjectEntry['data'], { entryType: 'project' }>;
};
export type ProjectPostEntry = ProjectEntry & {
  data: Extract<ProjectEntry['data'], { entryType: 'post' }>;
};

function compareByOrderThenSlug(a: { data: { order: number }; id: string }, b: { data: { order: number }; id: string }) {
  return a.data.order - b.data.order || a.id.localeCompare(b.id);
}

export function isProjectMetaEntry(entry: ProjectEntry): entry is ProjectMetaEntry {
  return entry.data.entryType === 'project';
}

export function isProjectPostEntry(entry: ProjectEntry): entry is ProjectPostEntry {
  return entry.data.entryType === 'post';
}

export function getProjectSlug(entry: ProjectEntry): string {
  if (isProjectPostEntry(entry)) {
    return entry.data.project;
  }

  return entry.id.split('/')[0];
}

export function getProjectPostSlug(post: ProjectPostEntry): string {
  return post.id.split('/').at(-1) ?? post.id;
}

export function getProjectMetas(entries: ProjectEntry[]): ProjectMetaEntry[] {
  return [...entries].filter(isProjectMetaEntry).sort(compareByOrderThenSlug);
}

export function getPublishedProjectPosts(entries: ProjectEntry[]): ProjectPostEntry[] {
  return [...entries]
    .filter(isProjectPostEntry)
    .filter((entry) => entry.data.status === 'published')
    .sort(compareByOrderThenSlug);
}

export function getProjectMeta(entries: ProjectEntry[], projectSlug: string): ProjectMetaEntry | null {
  return getProjectMetas(entries).find((entry) => getProjectSlug(entry) === projectSlug) ?? null;
}

export function getProjectPosts(entries: ProjectEntry[], projectSlug: string): ProjectPostEntry[] {
  return getPublishedProjectPosts(entries).filter((entry) => entry.data.project === projectSlug);
}

export function getProjectEntryPost(entries: ProjectEntry[], projectSlug: string): ProjectPostEntry | null {
  return getProjectPosts(entries, projectSlug)[0] ?? null;
}

export function getProjectHref(entries: ProjectEntry[], projectSlug: string): string {
  const entryPost = getProjectEntryPost(entries, projectSlug);
  return entryPost ? `/projects/${projectSlug}/${getProjectPostSlug(entryPost)}` : `/projects/${projectSlug}`;
}
