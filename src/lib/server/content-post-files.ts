import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseMarkdownDocument, type ParsedMarkdownDocument } from '@/lib/markdown-publish';

const POSTS_DIR = path.join(process.cwd(), 'content/posts');
const MARKDOWN_FILE_PATTERN = /\.(md|mdx)$/i;

async function walkMarkdownFiles(dirPath: string): Promise<string[]> {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        return walkMarkdownFiles(entryPath);
      }

      return MARKDOWN_FILE_PATTERN.test(entry.name) ? [entryPath] : [];
    })
  );

  return files.flat();
}

function matchesSlug(filePath: string, slug: string): boolean {
  const fileName = path.basename(filePath).replace(MARKDOWN_FILE_PATTERN, '');
  return fileName === slug || fileName.endsWith(`-${slug}`);
}

export async function getEditablePostBySlug(slug: string): Promise<ParsedMarkdownDocument | null> {
  const files = await walkMarkdownFiles(POSTS_DIR);
  const matchedFile = files.find((filePath) => matchesSlug(filePath, slug));

  if (!matchedFile) {
    return null;
  }

  const raw = await readFile(matchedFile, 'utf8');
  return parseMarkdownDocument(raw, path.basename(matchedFile));
}

export async function writeLocalPostFile(fileName: string, content: string) {
  const filePath = path.join(POSTS_DIR, fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');

  return filePath;
}

export async function deleteLocalPostFile(fileName: string) {
  const filePath = path.join(POSTS_DIR, fileName);

  try {
    await rm(filePath);
    return { filePath, deleted: true };
  } catch {
    return { filePath, deleted: false };
  }
}
