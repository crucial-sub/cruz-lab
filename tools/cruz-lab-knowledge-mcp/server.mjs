#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod/v4';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const ALLOWED_DOC_ROOTS = [
  'src/content/project-posts',
  'src/content/projects',
  'data/final-posts',
  'data/resume',
];

const ALLOWED_EXTENSIONS = new Set(['.md', '.mdx', '.txt']);
const IGNORED_DIRS = new Set(['node_modules', 'dist', '.astro', '.vercel', '.git']);
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

const absoluteDocRoots = ALLOWED_DOC_ROOTS.map((root) => path.resolve(REPO_ROOT, root));

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

function isAllowedPath(candidate) {
  return absoluteDocRoots.some((root) => isInside(root, candidate));
}

function isIgnoredFile(filePath) {
  const basename = path.basename(filePath);
  const extension = path.extname(filePath).toLowerCase();

  if (basename === '.DS_Store') return true;
  if (/^cruz-lab-firebase-adminsdk-.*\.json$/u.test(basename)) return true;
  if (extension === '.pdf') return true;
  if (!ALLOWED_EXTENSIONS.has(extension)) return true;

  return normalizeSlashes(path.relative(REPO_ROOT, filePath))
    .split('/')
    .some((part) => IGNORED_DIRS.has(part));
}

function relativeFromRoot(filePath) {
  return normalizeSlashes(path.relative(REPO_ROOT, filePath));
}

function slugFromPath(filePath) {
  return path.basename(filePath).replace(/\.(mdx?|txt)$/u, '');
}

function scopeFromPath(filePath) {
  const relative = relativeFromRoot(filePath);
  if (relative.startsWith('src/content/projects/')) return 'projects';
  if (relative.startsWith('src/content/project-posts/')) return 'project-posts';
  if (relative.startsWith('data/final-posts/')) return 'final-posts';
  if (relative.startsWith('data/resume/')) return 'resume';
  return 'unknown';
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
    throw new Error(
      `Document path is outside the allowed read roots: ${relativeFromRoot(filePath)}`,
    );
  }

  const raw = await fs.readFile(filePath, 'utf8');
  const { metadata, body } = parseFrontmatter(raw);
  const relativePath = relativeFromRoot(filePath);
  const slug = slugFromPath(filePath);

  return {
    path: relativePath,
    slug,
    scope: scopeFromPath(filePath),
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

async function getAllDocs(scope = 'all') {
  const files = [];

  for (const root of absoluteDocRoots) {
    files.push(...(await walkDocs(root)));
  }

  const docs = await Promise.all(files.sort().map((file) => readDocFile(file)));
  return scope === 'all' ? docs : docs.filter((doc) => doc.scope === scope);
}

async function getProjectDocs() {
  const projectRoot = path.resolve(REPO_ROOT, 'src/content/projects');
  const files = await walkDocs(projectRoot);
  const docs = await Promise.all(files.sort().map((file) => readDocFile(file)));
  return docs.filter((doc) => doc.scope === 'projects');
}

async function listProjects() {
  const projects = await getProjectDocs();
  const projectPosts = await getAllDocs('project-posts');

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
      throw new Error('Absolute paths are not allowed. Use a repo-relative document path.');
    }

    const candidate = path.resolve(REPO_ROOT, normalizeSlashes(value));
    return readDocFile(candidate);
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
  const resumePath = path.resolve(REPO_ROOT, 'data/resume/jungsub_resume.md');
  return readDocFile(resumePath);
}

async function getProjectContext(slug) {
  const projects = await getProjectDocs();
  const project = projects.find((doc) => doc.slug === slug);

  if (!project) {
    throw new Error(`No project found for slug "${slug}".`);
  }

  const projectPosts = (await getAllDocs('project-posts'))
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
      'List project documents from src/content/projects with related project-post counts.',
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
        .enum(['all', 'projects', 'project-posts', 'final-posts', 'resume'])
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
    description: 'Read a single allowed document by repo-relative path or unambiguous slug.',
    inputSchema: {
      pathOrSlug: z.string().min(1).describe('Repo-relative path or unambiguous document slug.'),
      scope: z
        .enum(['all', 'projects', 'project-posts', 'final-posts', 'resume'])
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
    description: 'Read data/resume/jungsub_resume.md. PDF files are intentionally excluded.',
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
    description: 'Return a project document and its related src/content/project-posts entries.',
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
    description: 'Project list from src/content/projects.',
    mimeType: 'application/json',
  },
  async (uri) => toResourceResult(uri.href, await listProjects()),
);

server.registerResource(
  'cruzlab-resume',
  'cruzlab://resume',
  {
    title: 'Jungsub Resume',
    description: 'Markdown resume from data/resume/jungsub_resume.md.',
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
    description: 'Project document and related project-posts for a project slug.',
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
            'Use the project document and related project-posts as source context.',
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
}

main().catch((error) => {
  console.error('Cruz Lab Knowledge MCP Server failed:', error);
  process.exit(1);
});
