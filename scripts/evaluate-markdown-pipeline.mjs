import { readFileSync } from 'node:fs';
import path from 'node:path';

function normalizeIsoDate(value) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
}

function fileNameToSlug(fileName = '') {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/[^a-z0-9가-힣-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function splitMarkdownDocument(markdown) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n*/);

  return {
    frontmatterBlock: frontmatterMatch?.[1] || '',
    content: frontmatterMatch ? normalized.slice(frontmatterMatch[0].length) : normalized,
  };
}

function parseFrontmatterBlock(frontmatterBlock) {
  const lines = frontmatterBlock.split('\n');
  const frontmatter = {};

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const match = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (!match) continue;

    const [, key, rawRest] = match;
    const rest = rawRest.trim();
    const currentIndent = (line.match(/^\s*/) || [''])[0].length;

    if (rest && rest !== '|' && rest !== '>') {
      frontmatter[key] = parseFrontmatterValue(rest);
      continue;
    }

    const nestedLines = [];
    let cursor = index + 1;

    for (; cursor < lines.length; cursor += 1) {
      const nextLine = lines[cursor];
      const nextTrimmed = nextLine.trim();
      const nextIndent = (nextLine.match(/^\s*/) || [''])[0].length;

      if (!nextTrimmed) {
        nestedLines.push(nextLine);
        continue;
      }

      if (nextIndent <= currentIndent) break;
      nestedLines.push(nextLine);
    }

    if (rest === '|' || rest === '>') {
      const blockLines = stripSharedIndent(nestedLines);
      frontmatter[key] =
        rest === '>'
          ? blockLines.map((item) => item.trim()).join(' ').trim()
          : blockLines.join('\n').trimEnd();
    } else {
      frontmatter[key] = parseIndentedBlock(nestedLines);
    }

    index = cursor - 1;
  }

  return frontmatter;
}

function parseFrontmatterValue(rawValue) {
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

function stripSharedIndent(lines) {
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

function parseIndentedBlock(lines) {
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

function getStringField(value) {
  return typeof value === 'string' ? value : undefined;
}

function getBooleanField(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function getNumberField(value) {
  return typeof value === 'number' ? value : undefined;
}

function getStringArrayField(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

function parseMarkdownDocument(markdown, fileName = '') {
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

function generateMarkdownContent(post) {
  const frontmatter = serializeFrontmatter({
    title: post.title,
    description: post.description,
    pubDate: normalizeIsoDate(post.pubDate),
    updatedDate: normalizeIsoDate(post.updatedDate),
    ...(post.heroImage ? { heroImage: post.heroImage } : {}),
    ...(post.heroVideo ? { heroVideo: post.heroVideo } : {}),
    tags: post.tags,
    slug: post.slug,
    readingTime: post.readingTime,
    isPublic: post.isPublic,
  });

  return `---\n${frontmatter}\n---\n\n${post.content.trimEnd()}\n`;
}

function escapeYamlString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function serializeScalar(value) {
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }

  return `"${escapeYamlString(String(value ?? ''))}"`;
}

function serializeFrontmatterEntry(key, value) {
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

function serializeFrontmatter(frontmatter) {
  return Object.entries(frontmatter)
    .flatMap(([key, value]) => serializeFrontmatterEntry(key, value))
    .join('\n');
}

function evaluateFixture(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = parseMarkdownDocument(raw, path.basename(filePath));
  const generated = generateMarkdownContent({
    title: parsed.title,
    description: parsed.description,
    content: parsed.content,
    heroImage: parsed.heroImage,
    heroVideo: parsed.heroVideo,
    tags: parsed.tags,
    slug: parsed.slug,
    readingTime: parsed.readingTime ?? 1,
    isPublic: parsed.isPublic ?? true,
    pubDate: parsed.pubDate,
    updatedDate: parsed.updatedDate,
  });

  const findings = [];

  if (parsed.tags.length === 0) {
    findings.push('tags를 읽지 못함');
  }

  if (!generated.includes('tags:\n')) {
    findings.push('출간 결과가 block list tags 형식이 아님');
  }

  if (raw !== generated) {
    findings.push('원본 markdown과 publish 결과가 동일하지 않음');
  }

  return {
    filePath,
    parsed,
    findings,
    generatedPreview: generated.split('\n').slice(0, 14).join('\n'),
  };
}

const fixturePath = path.resolve(process.cwd(), 'fixtures/editor-roundtrip-stress.md');
const result = evaluateFixture(fixturePath);

console.log('=== Markdown Pipeline Evaluation ===');
console.log(`fixture: ${result.filePath}`);
console.log(`title: ${result.parsed.title}`);
console.log(`slug: ${result.parsed.slug}`);
console.log(`parsed tags: ${JSON.stringify(result.parsed.tags)}`);
console.log(`readingTime: ${result.parsed.readingTime}`);
console.log('');

if (result.findings.length === 0) {
  console.log('findings: none');
} else {
  console.log('findings:');
  for (const finding of result.findings) {
    console.log(`- ${finding}`);
  }
}

console.log('');
console.log('generated frontmatter preview:');
console.log(result.generatedPreview);
