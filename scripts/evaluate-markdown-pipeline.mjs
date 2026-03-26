import { readFileSync } from 'node:fs';
import path from 'node:path';

function escapeYamlString(value) {
  return value.replace(/"/g, '\\"');
}

function normalizeIsoDate(value) {
  return value ? new Date(value).toISOString() : new Date().toISOString();
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
      .map((line) => parseFrontmatterValue(line))
      .filter((item) => typeof item === 'string' && item.length > 0);
  }

  return normalizedLines.join('\n').trim();
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

function fileNameToSlug(fileName = '') {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/[^a-z0-9가-힣-]/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function parseMarkdownDocument(markdown, fileName = '') {
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
    tags: Array.isArray(frontmatter.tags)
      ? frontmatter.tags.filter((tag) => typeof tag === 'string')
      : [],
    slug: typeof frontmatter.slug === 'string' ? frontmatter.slug : fileNameToSlug(fileName),
    pubDate: typeof frontmatter.pubDate === 'string' ? frontmatter.pubDate : undefined,
    updatedDate: typeof frontmatter.updatedDate === 'string' ? frontmatter.updatedDate : undefined,
    readingTime: typeof frontmatter.readingTime === 'number' ? frontmatter.readingTime : undefined,
    isPublic: typeof frontmatter.isPublic === 'boolean' ? frontmatter.isPublic : undefined,
  };
}

function generateMarkdownContent(post) {
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

function evaluateFixture(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const parsed = parseMarkdownDocument(raw, path.basename(filePath));
  const generated = generateMarkdownContent({
    title: parsed.title,
    description: parsed.description,
    content: parsed.content,
    heroImage: parsed.heroImage,
    tags: parsed.tags,
    slug: parsed.slug,
    readingTime: parsed.readingTime ?? 1,
    isPublic: parsed.isPublic ?? true,
    pubDate: parsed.pubDate,
    updatedDate: parsed.updatedDate,
  });

  const findings = [];

  if (parsed.tags.length === 0) {
    findings.push('block list 형식의 tags를 읽지 못함');
  }

  if (!generated.includes('tags: [')) {
    findings.push('출간 결과가 inline tags 형식이 아님');
  }

  if (raw !== generated) {
    findings.push('원본 markdown과 publish 결과가 동일하지 않음');
  }

  if (generated.includes('tags: []')) {
    findings.push('출간 결과에서 tags 정보가 비어 있음');
  }

  return {
    filePath,
    parsed,
    findings,
    generatedPreview: generated.split('\n').slice(0, 12).join('\n'),
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
