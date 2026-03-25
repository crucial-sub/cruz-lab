export interface PublishPostInput {
  title: string;
  description: string;
  content: string;
  heroImage?: string;
  tags: string[];
  slug: string;
  readingTime: number;
  isPublic: boolean;
  pubDate?: string;
  updatedDate?: string;
}

function escapeYamlString(value: string): string {
  return value.replace(/"/g, '\\"');
}

export function normalizeIsoDate(value?: string): string {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

export function generateMarkdownContent(post: PublishPostInput): string {
  const pubDate = normalizeIsoDate(post.pubDate);
  const updatedDate = normalizeIsoDate(post.updatedDate);

  const frontmatter = `---
title: "${escapeYamlString(post.title)}"
description: "${escapeYamlString(post.description)}"
pubDate: "${pubDate}"
updatedDate: "${updatedDate}"
heroImage: "${post.heroImage || ''}"
tags: [${post.tags.map((tag) => `"${escapeYamlString(tag)}"`).join(', ')}]
slug: "${escapeYamlString(post.slug)}"
readingTime: ${post.readingTime}
isPublic: ${post.isPublic}
---`;

  return `${frontmatter}\n\n${post.content}`.trimEnd() + '\n';
}

export function generateMarkdownFileName({
  slug,
  pubDate,
}: {
  slug: string;
  pubDate?: string;
}): string {
  const date = normalizeIsoDate(pubDate).split('T')[0];
  const safeSlug = slug.replace(/[^a-z0-9가-힣-]/gi, '-').toLowerCase();
  return `${date}-${safeSlug}.md`;
}
