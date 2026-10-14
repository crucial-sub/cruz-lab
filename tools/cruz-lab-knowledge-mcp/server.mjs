#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// career 폴더의 위치를 정한다
// - 환경 변수 CRUZ_LAB_CAREER_ROOT가 있으면 그 절대 경로를 쓴다
// - 없으면 저장소 옆의 career 폴더를 쓴다
function resolveCareerRoot() {
  const value = process.env.CRUZ_LAB_CAREER_ROOT;
  if (!value) return path.resolve(REPO_ROOT, '../career');

  if (!path.isAbsolute(value)) {
    throw new Error(`CRUZ_LAB_CAREER_ROOT must be an absolute path. Received: ${value}`);
  }

  return path.resolve(value);
}

const CAREER_ROOT = resolveCareerRoot();

// 읽기 루트 목록
// - scope: 검색 범위 이름
// - prefix: 결과에 표기하는 문서 경로의 앞부분
// - dir: 실제 폴더의 절대 경로
// - ignoredDirs: 이 루트 안에서 읽지 않는 폴더 이름
const DOC_ROOTS = [
  {
    scope: 'projects',
    prefix: 'src/content/projects',
    dir: path.resolve(REPO_ROOT, 'src/content/projects'),
    ignoredDirs: [],
  },
  {
    scope: 'final-posts',
    prefix: 'career/writing/final-posts',
    dir: path.resolve(CAREER_ROOT, 'writing/final-posts'),
    ignoredDirs: [],
  },
  {
    scope: 'resume',
    prefix: 'career/resume',
    dir: path.resolve(CAREER_ROOT, 'resume'),
    ignoredDirs: ['archive'],
  },
];

const ALLOWED_EXTENSIONS = new Set(['.md', '.mdx', '.txt']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.astro', '.vercel', '.git']);
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

const server = new McpServer({
  name: 'cruz-lab-knowledge-mcp',
  version: '0.1.0',
});

const readOnlyAnnotations = {
  readOnlyHint: true,
  openWorldHint: false,
};

function toToolResult(data) {
  return {
    content: [
      {
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toResourceResult(uri, data, mimeType = 'application/json') {
  return {
    contents: [
      {
        uri,
        mimeType,
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function normalizeSlashes(value) {
  return value.replaceAll('\\', '/');
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

// 파일이 속한 읽기 루트를 찾는다. 어느 루트에도 속하지 않으면 undefined를 돌려준다
function rootForPath(filePath) {
  return DOC_ROOTS.find((root) => isInside(root.dir, filePath));
}

function isAllowedPath(candidate) {
  return Boolean(rootForPath(candidate));
}

function isIgnoredFile(filePath) {
  const basename = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (basename === '.DS_Store') return true;
  if (/^cruz-lab-firebase-adminsdk-.*\.json$/u.test(basename)) return true;
  if (extension === '.pdf') return true;
  if (!ALLOWED_EXTENSIONS.has(extension)) return true;

  const root = rootForPath(filePath);
  const baseDir = root ? root.dir : REPO_ROOT;
  const rootIgnoredDirs = root ? root.ignoredDirs : [];

  // 폴더 이름은 소문자로 바꿔서 비교한다. macOS의 파일 시스템은 대소문자를 구분하지 않는다
  return normalizeSlashes(path.relative(baseDir, filePath))
    .split('/')
    .map((part) => part.toLowerCase())
    .some((part) => IGNORED_DIRS.has(part) || rootIgnoredDirs.includes(part));
}

// 결과에 표기하는 문서 경로를 만든다
// - 읽기 루트 안의 파일은 "prefix/루트 기준 상대 경로"로 표기한다
// - 그 밖의 파일은 저장소 기준 상대 경로로 표기한다
function displayPath(filePath) {
  const root = rootForPath(filePath);
  if (!root) return normalizeSlashes(path.relative(REPO_ROOT, filePath));

  const rest = normalizeSlashes(path.relative(root.dir, filePath));
  return rest ? `${root.prefix}/${rest}` : root.prefix;
}

// 문서 경로 표기를 실제 파일 경로로 바꾼다
// - 읽기 루트의 prefix로 시작하면 그 루트의 폴더 기준으로 푼다
// - 그 밖의 경로는 저장소 기준으로 푼다. 허용 여부는 readDocFile이 검사한다
function resolveDocPath(value) {
  const docPath = path.posix.normalize(normalizeSlashes(value));
  const root = DOC_ROOTS.find(
    (item) => docPath === item.prefix || docPath.startsWith(`${item.prefix}/`),
  );
  if (!root) return path.resolve(REPO_ROOT, docPath);

  return path.resolve(root.dir, docPath.slice(root.prefix.length + 1));
}

function projectSlugFromPath(filePath) {
  const relative = displayPath(filePath);
  if (!relative.startsWith('src/content/projects/')) return '';

  return relative.replace(/^src\/content\/projects\//u, '').split('/')[0] || '';
}

function slugFromPath(filePath, metadata = {}) {
  if (metadata.entryType === 'project') {
    return projectSlugFromPath(filePath);
  }

  return path.basename(filePath).replace(/\.(mdx?|txt)$/u, '');
}

function scopeFromPath(filePath) {
  return rootForPath(filePath)?.scope ?? 'unknown';
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(value) {
  const unquoted = stripQuotes(value);
  if (unquoted === 'true') return true;
  if (unquoted === 'false') return false;
  if (/^-?\d+$/u.test(unquoted)) return Number(unquoted);
  return unquoted;
}

function parseInlineArray(value) {
  if (!value.startsWith('[') || !value.endsWith(']')) return null;
  return value
    .slice(1, -1)
    .split(',')
    .map((item) => stripQuotes(item))
    .filter(Boolean);
}

function parseFrontmatter(raw) {
  if (!raw.startsWith('---')) {
    return { metadata: {}, body: raw };
  }

  const closing = raw.indexOf('\n---', 3);
  if (closing === -1) {
    return { metadata: {}, body: raw };
  }

  const metadata = {};
  const frontmatter = raw.slice(3, closing).trim();
  const body = raw.slice(closing + '\n---'.length).replace(/^\r?\n/u, '');
  const lines = frontmatter.split(/\r?\n/u);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/u.exec(line);
    if (!match) continue;

    const [, key, value] = match;
    const inlineArray = parseInlineArray(value.trim());

    if (inlineArray) {
      metadata[key] = inlineArray;
      continue;
    }

    if (value.trim() !== '') {
      metadata[key] = parseScalar(value);
      continue;
    }

    const items = [];
    let nextIndex = index + 1;
    while (nextIndex < lines.length) {
      const itemMatch = /^\s*-\s+(.+)$/u.exec(lines[nextIndex]);
      if (!itemMatch) break;
      items.push(parseScalar(itemMatch[1]));
      nextIndex += 1;
    }

    metadata[key] = items.length > 0 ? items : '';
    index = nextIndex - 1;
  }

  return { metadata, body };
}

async function walkDocs(dir) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) continue;

    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDocs(entryPath)));
      continue;
    }

    if (!entry.isFile() || isIgnoredFile(entryPath)) continue;
    files.push(entryPath);
  }

  return files;
}

async function readDocFile(filePath) {
  if (!isAllowedPath(filePath) || isIgnoredFile(filePath)) {
    throw new Error(`Document path is outside the allowed read roots: ${displayPath(filePath)}`);
  }

  const raw = await fs.readFile(filePath, 'utf8');
  const { metadata, body } = parseFrontmatter(raw);
  const relativePath = displayPath(filePath);
  const slug = slugFromPath(filePath, metadata);

  return {
    path: relativePath,
    slug,
    scope: scopeFromPath(filePath),
    entryType: metadata.entryType || '',
    title: metadata.title || slug,
    description: metadata.description || '',
    project: metadata.project || '',
    status: metadata.status || '',
    order: metadata.order || '',
    tags: Array.isArray(metadata.tags) ? metadata.tags : [],
    tech: Array.isArray(metadata.tech) ? metadata.tech : [],
    metadata,
    body,
    content: raw,
  };
}

async function rootExists(root) {
  try {
    await fs.access(root.dir);
    return true;
  } catch {
    return false;
  }
}

// 읽기 루트의 폴더가 없을 때 쓰는 오류를 만든다
function missingRootError(root) {
  return new Error(
    `Document root for scope "${root.scope}" was not found: ${root.prefix}. ` +
      'If this is a career path, set CRUZ_LAB_CAREER_ROOT to the absolute path of the career folder.',
  );
}

// 문서를 읽는다
// - scope가 all이면 있는 루트만 읽는다
// - scope를 지정했는데 그 루트가 없으면 오류를 낸다
async function getAllDocs(scope = 'all') {
  const roots = scope === 'all' ? DOC_ROOTS : DOC_ROOTS.filter((root) => root.scope === scope);
  const files = [];

  for (const root of roots) {
    if (!(await rootExists(root))) {
      if (scope === 'all') continue;
      throw missingRootError(root);
    }

    files.push(...(await walkDocs(root.dir)));
  }

  const docs = await Promise.all(files.map((file) => readDocFile(file)));
  return docs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

async function getProjectDocs() {
  return (await getAllDocs('projects')).filter((doc) => doc.entryType === 'project');
}

async function getProjectPostDocs() {
  return (await getAllDocs('projects')).filter((doc) => doc.entryType === 'post');
}

async function listProjects() {
  const projects = await getProjectDocs();
  const projectPosts = await getProjectPostDocs();

  return projects
    .map((project) => ({
      slug: project.slug,
      title: project.title,
      description: project.description,
      tech: project.tech,
      tags: project.tags,
      order: project.order,
      path: project.path,
      relatedPostCount: projectPosts.filter((post) => post.project === project.slug).length,
    }))
    .sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      return orderA - orderB || a.slug.localeCompare(b.slug);
    });
}

function buildSnippet(content, query) {
  const normalizedQuery = query.toLocaleLowerCase();
  const lines = content.split(/\r?\n/u);
  const matchingLine = lines.find((line) => line.toLocaleLowerCase().includes(normalizedQuery));

  if (!matchingLine) return '';

  const compact = matchingLine.replace(/\s+/gu, ' ').trim();
  if (compact.length <= 180) return compact;

  const index = compact.toLocaleLowerCase().indexOf(normalizedQuery);
  const start = Math.max(0, index - 70);
  const end = Math.min(compact.length, index + normalizedQuery.length + 90);
  return `${start > 0 ? '...' : ''}${compact.slice(start, end)}${end < compact.length ? '...' : ''}`;
}

async function searchDocs({ query, scope = 'all', limit = DEFAULT_LIMIT }) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  const normalizedQuery = trimmedQuery.toLocaleLowerCase();
  const boundedLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
  const docs = await getAllDocs(scope);

  return docs
    .filter((doc) => doc.content.toLocaleLowerCase().includes(normalizedQuery))
    .slice(0, boundedLimit)
    .map((doc) => ({
      path: doc.path,
      slug: doc.slug,
      scope: doc.scope,
      title: doc.title,
      description: doc.description,
      project: doc.project,
      snippet: buildSnippet(doc.content, trimmedQuery),
    }));
}

async function resolveDocByPathOrSlug(pathOrSlug, scope = 'all') {
  const value = pathOrSlug.trim();
  if (!value) {
    throw new Error('pathOrSlug is required.');
  }

  const looksLikePath = value.includes('/') || value.includes('\\') || path.extname(value) !== '';

  if (looksLikePath) {
    if (path.isAbsolute(value)) {
      throw new Error('Absolute paths are not allowed. Use a document path from search results.');
    }

    return readDocFile(resolveDocPath(value));
  }

  const docs = await getAllDocs(scope);
  const matches = docs.filter((doc) => doc.slug === value);

  if (matches.length === 0) {
    throw new Error(`No document found for slug "${value}".`);
  }

  if (matches.length > 1) {
    const candidates = matches.map((doc) => doc.path).join(', ');
    throw new Error(`Slug "${value}" is ambiguous. Use one of these paths: ${candidates}`);
  }

  return matches[0];
}

async function getResumeDoc() {
  const resumeRoot = DOC_ROOTS.find((root) => root.scope === 'resume');
  if (!(await rootExists(resumeRoot))) throw missingRootError(resumeRoot);

  return readDocFile(path.join(resumeRoot.dir, 'jungsub_resume.md'));
}

async function getProjectContext(slug) {
  const projects = await getProjectDocs();
  const project = projects.find((doc) => doc.slug === slug);

  if (!project) {
    throw new Error(`No project found for slug "${slug}".`);
  }

  const projectPosts = (await getProjectPostDocs())
    .filter((doc) => doc.project === slug)
    .sort((a, b) => {
      const orderA = typeof a.order === 'number' ? a.order : Number.MAX_SAFE_INTEGER;
      const orderB = typeof b.order === 'number' ? b.order : Number.MAX_SAFE_INTEGER;
      return orderA - orderB || a.slug.localeCompare(b.slug);
    });

  return {
    project: {
      path: project.path,
      slug: project.slug,
      title: project.title,
      description: project.description,
      tech: project.tech,
      tags: project.tags,
      body: project.body,
    },
    projectPosts: projectPosts.map((post) => ({
      path: post.path,
      slug: post.slug,
      title: post.title,
      description: post.description,
      status: post.status,
      order: post.order,
      body: post.body,
    })),
  };
}

server.registerTool(
  'list_projects',
  {
    title: 'List Cruz Lab projects',
    description:
      'List project metadata documents from src/content/projects with related project post counts.',
    inputSchema: {},
    annotations: readOnlyAnnotations,
  },
  async () => toToolResult(await listProjects()),
);

server.registerTool(
  'search_docs',
  {
    title: 'Search Cruz Lab docs',
    description: 'Search allowed Cruz Lab markdown documents with simple keyword matching.',
    inputSchema: {
      query: z.string().min(1).describe('Keyword to search for.'),
      scope: z
        .enum(['all', 'projects', 'final-posts', 'resume'])
        .optional()
        .default('all')
        .describe('Optional document scope.'),
      limit: z.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
    },
    annotations: readOnlyAnnotations,
  },
  async ({ query, scope, limit }) => toToolResult(await searchDocs({ query, scope, limit })),
);

server.registerTool(
  'read_doc',
  {
    title: 'Read Cruz Lab document',
    description: 'Read a single allowed document by document path or unambiguous slug.',
    inputSchema: {
      pathOrSlug: z
        .string()
        .min(1)
        .describe('Document path from search results, or an unambiguous document slug.'),
      scope: z
        .enum(['all', 'projects', 'final-posts', 'resume'])
        .optional()
        .default('all')
        .describe('Optional scope for slug lookup.'),
    },
    annotations: readOnlyAnnotations,
  },
  async ({ pathOrSlug, scope }) => {
    const doc = await resolveDocByPathOrSlug(pathOrSlug, scope);
    return toToolResult({
      path: doc.path,
      slug: doc.slug,
      scope: doc.scope,
      metadata: doc.metadata,
      content: doc.content,
    });
  },
);

server.registerTool(
  'get_resume',
  {
    title: 'Get Jungsub resume',
    description: 'Read career/resume/jungsub_resume.md. PDF files are intentionally excluded.',
    inputSchema: {},
    annotations: readOnlyAnnotations,
  },
  async () => {
    const doc = await getResumeDoc();
    return toToolResult({
      path: doc.path,
      metadata: doc.metadata,
      content: doc.content,
    });
  },
);

server.registerTool(
  'get_project_context',
  {
    title: 'Get Cruz Lab project context',
    description: 'Return a project metadata document and its related project post entries.',
    inputSchema: {
      slug: z.string().min(1).describe('Project slug, for example cruz-lab.'),
    },
    annotations: readOnlyAnnotations,
  },
  async ({ slug }) => toToolResult(await getProjectContext(slug)),
);

server.registerResource(
  'cruzlab-projects',
  'cruzlab://projects',
  {
    title: 'Cruz Lab Projects',
    description: 'Project list from src/content/projects/*/project.md.',
    mimeType: 'application/json',
  },
  async (uri) => toResourceResult(uri.href, await listProjects()),
);

server.registerResource(
  'cruzlab-resume',
  'cruzlab://resume',
  {
    title: 'Jungsub Resume',
    description: 'Markdown resume from career/resume/jungsub_resume.md.',
    mimeType: 'text/markdown',
  },
  async (uri) => {
    const doc = await getResumeDoc();
    return toResourceResult(uri.href, doc.content, 'text/markdown');
  },
);

server.registerResource(
  'cruzlab-project',
  new ResourceTemplate('cruzlab://project/{slug}', {
    list: async () => ({
      resources: (await listProjects()).map((project) => ({
        uri: `cruzlab://project/${project.slug}`,
        name: `project-${project.slug}`,
        title: project.title,
        description: project.description,
        mimeType: 'application/json',
      })),
    }),
    complete: {
      slug: async (value) => {
        const normalizedValue = value.toLocaleLowerCase();
        return (await listProjects())
          .map((project) => project.slug)
          .filter((slug) => slug.toLocaleLowerCase().startsWith(normalizedValue));
      },
    },
  }),
  {
    title: 'Cruz Lab Project Context',
    description: 'Project metadata document and related project posts for a project slug.',
    mimeType: 'application/json',
  },
  async (uri, variables) => toResourceResult(uri.href, await getProjectContext(variables.slug)),
);

server.registerPrompt(
  'interview_questions',
  {
    title: 'Interview Questions',
    description: 'Prepare interview questions from a Cruz Lab project context.',
    argsSchema: {
      slug: z.string().min(1).describe('Project slug, for example cruz-lab.'),
    },
  },
  async ({ slug }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Use the Cruz Lab project context for "${slug}" to draft interview questions.`,
            'Focus on implementation decisions, tradeoffs, debugging, and what was intentionally left out.',
            'Keep the tone grounded. Do not frame a small local MCP experiment as a flagship project.',
            `Start by calling get_project_context with slug "${slug}" if the context is not already loaded.`,
          ].join('\n'),
        },
      },
    ],
  }),
);

server.registerPrompt(
  'blog_post_context',
  {
    title: 'Blog Post Context',
    description: 'Prepare a grounded follow-up post brief from a Cruz Lab project context.',
    argsSchema: {
      slug: z.string().min(1).describe('Project slug, for example cruz-lab.'),
    },
  },
  async ({ slug }) => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Prepare a concise writing brief for a follow-up post about "${slug}".`,
            'Use the project metadata document and related project posts as source context.',
            'Keep the angle narrow and practical. Avoid overstating the portfolio value.',
            'For cruz-lab-knowledge-mcp, frame it as a small local MCP server that helped check tool/resource/prompt boundaries.',
            `Start by calling get_project_context with slug "${slug}" if the context is not already loaded.`,
          ].join('\n'),
        },
      },
    ],
  }),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Cruz Lab Knowledge MCP Server running on stdio');

  for (const root of DOC_ROOTS) {
    if (!(await rootExists(root))) {
      console.error(`Warning: document root not found for scope "${root.scope}": ${root.dir}`);
    }
  }
}

main().catch((error) => {
  console.error('Cruz Lab Knowledge MCP Server failed:', error);
  process.exit(1);
});
