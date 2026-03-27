export interface PublishPostInput {
  title: string;
  description: string;
  content: string;
  heroImage?: string;
  heroVideo?: string;
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
  heroVideo?: string;
  tags: string[];
  slug: string;
  pubDate?: string;
  updatedDate?: string;
  readingTime?: number;
  isPublic?: boolean;
}

interface SplitMarkdownDocument {
  frontmatterBlock: string;
  content: string;
}

const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---\n*/;

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

function splitMarkdownDocument(markdown: string): SplitMarkdownDocument {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const frontmatterMatch = normalized.match(FRONTMATTER_PATTERN);

  return {
    frontmatterBlock: frontmatterMatch?.[1] || '',
    content: frontmatterMatch ? normalized.slice(frontmatterMatch[0].length) : normalized,
  };
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
      .map((line) => parseFrontmatterValue(line));
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

function getStringField(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function getBooleanField(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getNumberField(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function getStringArrayField(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function serializeScalar(value: unknown): string {
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }

  return `"${escapeYamlString(String(value ?? ''))}"`;
}

function serializeFrontmatterEntry(key: string, value: unknown): string[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${key}: []`];
    }

    return [`${key}:`, ...value.map((item) => `  - ${serializeScalar(item)}`)];
  }

  if (typeof value === 'string' && value.includes('\n')) {
    return [`${key}: |`, ...value.split('\n').map((line) => `  ${line}`)];
  }

  return [`${key}: ${serializeScalar(value)}`];
}

function serializeFrontmatter(post: PublishPostInput): string {
  const entries = [
    ['title', post.title],
    ['description', post.description],
    ['pubDate', normalizeIsoDate(post.pubDate)],
    ['updatedDate', normalizeIsoDate(post.updatedDate)],
    ...(post.heroImage ? [['heroImage', post.heroImage] as const] : []),
    ...(post.heroVideo ? [['heroVideo', post.heroVideo] as const] : []),
    ['tags', post.tags],
    ['slug', post.slug],
    ['readingTime', post.readingTime],
    ['isPublic', post.isPublic],
  ];

  return entries
    .flatMap(([key, value]) => serializeFrontmatterEntry(key, value))
    .join('\n');
}

export function normalizeIsoDate(value?: string): string {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

export function parseMarkdownDocument(markdown: string, fileName?: string): ParsedMarkdownDocument {
  const { frontmatterBlock, content } = splitMarkdownDocument(markdown);
  const frontmatter = parseFrontmatterBlock(frontmatterBlock);

  const headingTitle =
    content.match(/^#\s+(.+)$/m)?.[1]?.trim() ||
    fileNameToSlug(fileName).replace(/-/g, ' ').trim();

  return {
    title: getStringField(frontmatter.title) || headingTitle,
    description: getStringField(frontmatter.description) || '',
    content: content.trim(),
    heroImage: getStringField(frontmatter.heroImage) || '',
    heroVideo: getStringField(frontmatter.heroVideo),
    tags: getStringArrayField(frontmatter.tags),
    slug: getStringField(frontmatter.slug) || fileNameToSlug(fileName),
    pubDate: getStringField(frontmatter.pubDate),
    updatedDate: getStringField(frontmatter.updatedDate),
    readingTime: getNumberField(frontmatter.readingTime),
    isPublic: getBooleanField(frontmatter.isPublic),
  };
}

export function generateMarkdownContent(post: PublishPostInput): string {
  const body = post.content.trimEnd();
  const frontmatter = serializeFrontmatter(post);
  return `---\n${frontmatter}\n---\n\n${body}\n`;
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
