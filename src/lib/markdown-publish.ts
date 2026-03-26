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

function stripSharedIndent(lines: string[]): string[] {
  const nonEmptyLines = lines.filter((line) => line.trim().length > 0);
  if (nonEmptyLines.length === 0) return lines.map(() => '');

  const minIndent = Math.min(
    ...nonEmptyLines.map((line) => {
      const match = line.match(/^\s*/);
      return match ? match[0].length : 0;
    })
  );

  return lines.map((line) => line.slice(Math.min(minIndent, line.length)));
}

function parseIndentedBlock(lines: string[]): unknown {
  const normalizedLines = stripSharedIndent(lines);
  const trimmedLines = normalizedLines.filter((line) => line.trim().length > 0);

  if (trimmedLines.length === 0) return '';

  const isListBlock = trimmedLines.every((line) => line.trimStart().startsWith('- '));
  if (isListBlock) {
    return trimmedLines
      .map((line) => line.trimStart().replace(/^- /, ''))
      .map((line) => parseFrontmatterValue(line))
      .filter((item): item is string => typeof item === 'string' && item.length > 0);
  }

  return normalizedLines.join('\n').trim();
}

function parseFrontmatterBlock(frontmatterBlock: string): Record<string, unknown> {
  const lines = frontmatterBlock.split('\n');
  const frontmatter: Record<string, unknown> = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!match) continue;

    const [, key, rawRest] = match;
    const rest = rawRest.trim();
    const currentIndent = line.match(/^\s*/)?.[0].length ?? 0;

    if (rest && rest !== '|' && rest !== '>') {
      frontmatter[key] = parseFrontmatterValue(rest);
      continue;
    }

    const nestedLines: string[] = [];
    let cursor = index + 1;

    for (; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor];
      const nextTrimmed = nextLine.trim();
      const nextIndent = nextLine.match(/^\s*/)?.[0].length ?? 0;

      if (!nextTrimmed) {
        nestedLines.push(nextLine);
        continue;
      }

      if (nextIndent <= currentIndent) break;
      nestedLines.push(nextLine);
    }

    if (rest === '|' || rest === '>') {
      const blockLines = stripSharedIndent(nestedLines);
      const joined =
        rest === '>'
          ? blockLines.map((item) => item.trim()).join(' ').trim()
          : blockLines.join('\n').trimEnd();
      frontmatter[key] = joined;
    } else {
      frontmatter[key] = parseIndentedBlock(nestedLines);
    }

    index = cursor - 1;
  }

  return frontmatter;
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
  const frontmatter = parseFrontmatterBlock(frontmatterBlock);

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
