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

export interface ParsedMarkdownDocument {
  title: string;
  description: string;
  content: string;
  heroImage: string;
  tags: string[];
  slug: string;
  pubDate?: string;
  updatedDate?: string;
  readingTime?: number;
  isPublic?: boolean;
}

function escapeYamlString(value: string): string {
  return value.replace(/"/g, '\\"');
}

export function normalizeIsoDate(value?: string): string {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function parseFrontmatterValue(rawValue: string): unknown {
  const value = rawValue.trim();

  if (!value) return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);

  if (value.startsWith('[') && value.endsWith(']')) {
    try {
      return JSON.parse(value);
    } catch {
      return value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }
  }

  return value.replace(/^['"]|['"]$/g, '');
}

function fileNameToSlug(fileName?: string): string {
  if (!fileName) return '';

  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/[^a-z0-9가-힣-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

export function parseMarkdownDocument(markdown: string, fileName?: string): ParsedMarkdownDocument {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n*/);
  const frontmatterBlock = frontmatterMatch?.[1] || '';
  const content = frontmatterMatch ? normalized.slice(frontmatterMatch[0].length) : normalized;

  const frontmatter = Object.fromEntries(
    frontmatterBlock
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex === -1) return [line, ''];

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1);
        return [key, parseFrontmatterValue(value)];
      })
  ) as Record<string, unknown>;

  const headingTitle =
    content.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    fileNameToSlug(fileName).replace(/-/g, ' ').trim();

  return {
    title: typeof frontmatter.title === 'string' ? frontmatter.title : headingTitle,
    description: typeof frontmatter.description === 'string' ? frontmatter.description : '',
    content: content.trim(),
    heroImage: typeof frontmatter.heroImage === 'string' ? frontmatter.heroImage : '',
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    slug: typeof frontmatter.slug === 'string' ? frontmatter.slug : fileNameToSlug(fileName),
    pubDate: typeof frontmatter.pubDate === 'string' ? frontmatter.pubDate : undefined,
    updatedDate: typeof frontmatter.updatedDate === 'string' ? frontmatter.updatedDate : undefined,
    readingTime: typeof frontmatter.readingTime === 'number' ? frontmatter.readingTime : undefined,
    isPublic: typeof frontmatter.isPublic === 'boolean' ? frontmatter.isPublic : undefined,
  };
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
