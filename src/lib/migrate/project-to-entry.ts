// 프로젝트 글 이전: 저장소 파일 → entries·seriesMeta 문서 (재건 4단계 D1, Plan 7절)
// - 순수 함수만 둔다. 파일·Firestore·Storage를 읽거나 쓰지 않는다. 단위 테스트 대상이다.
// - 이전 스크립트(scripts/migrate/stage4-projects.mjs)가 Node로 직접 가져온다.
//   그래서 상대 경로 import에 `.ts`를 붙이고 '@/…' 별칭을 쓰지 않는다.
//
// 원본 모양 (src/content/projects/<프로젝트 key>/)
// - project.md: entryType "project". 프로젝트 이름·설명·기술·링크·순서·기간. 본문 없음.
// - <글 slug>.md: entryType "post". 제목·설명·project·order·chapterLabel·status + 본문.
//   본문 이미지는 ../../../assets/img/projects/<key>/<파일> 상대 경로다.

import { createHash } from 'node:crypto';
import { calculateReadingTime, countWords } from '../../utils/readingTime.ts';
import {
  PROJECT_MONTH_PATTERN,
  projectMetaSchema,
  toMillisValue,
  type EntryStatus,
  type ProjectMeta,
  type SeriesRef,
  type TimestampLike,
} from '../entry-schema.ts';
import { SERIES_KEY_PATTERN, isValidSlug } from '../taxonomy.ts';

// 원본이 규칙에 맞지 않을 때 던진다. 스크립트는 아무것도 쓰지 않고 멈춘다
export class ProjectSourceError extends Error {
  constructor(message: string, file: string | null = null) {
    super(file ? `[${file}] ${message}` : message);
    this.name = 'ProjectSourceError';
  }
}

// ───────────── frontmatter ─────────────

// frontmatter 값: 문자열, 수, 참거짓, 문자열 목록
export type FrontmatterValue = string | number | boolean | string[];

// 따옴표 값 하나를 푼다. 따옴표가 없으면 그대로 돌려준다
function unquote(raw: string, file: string): string {
  const value = raw.trim();
  if (value.startsWith('"')) {
    if (!value.endsWith('"') || value.length < 2)
      throw new ProjectSourceError(`닫히지 않은 따옴표: ${value}`, file);
    // JSON 문자열 규칙과 같다(\" \\ \n)
    try {
      return JSON.parse(value) as string;
    } catch {
      throw new ProjectSourceError(`읽을 수 없는 문자열: ${value}`, file);
    }
  }
  if (value.startsWith("'")) {
    if (!value.endsWith("'") || value.length < 2)
      throw new ProjectSourceError(`닫히지 않은 따옴표: ${value}`, file);
    // YAML 작은따옴표: '' 가 ' 하나다
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

// 따옴표 없는 값: true/false, 정수, 그 밖은 글자 그대로(YYYY-MM 같은 값)
function plainScalar(raw: string): FrontmatterValue {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

// 프로젝트 파일의 frontmatter를 읽는다
// - 이 저장소의 프로젝트 파일 12개가 쓰는 모양만 받는다: `키: 값`, `키:` 뒤 `  - 값` 목록.
// - 다른 모양(여러 줄 문자열, 중첩 객체, 인라인 목록)은 오류다. 조용히 틀리게 읽지 않는다.
export function parseFrontmatter(
  text: string,
  file = '',
): { data: Record<string, FrontmatterValue>; body: string } {
  const normalized = text.replace(/\r\n/g, '\n');
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!match) throw new ProjectSourceError('frontmatter(---)가 없습니다', file);
  const data: Record<string, FrontmatterValue> = {};
  let listKey: string | null = null;
  for (const line of match[1].split('\n')) {
    if (!line.trim()) continue;
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item) {
      if (!listKey) throw new ProjectSourceError(`목록 항목의 키가 없습니다: ${line}`, file);
      (data[listKey] as string[]).push(unquote(item[1], file));
      continue;
    }
    const pair = /^([A-Za-z][A-Za-z0-9_]*):(?:\s+(.*))?$/.exec(line);
    if (!pair) throw new ProjectSourceError(`읽을 수 없는 줄: ${line}`, file);
    const [, key, rawValue] = pair;
    if (key in data) throw new ProjectSourceError(`같은 키가 두 번 있습니다: ${key}`, file);
    if (rawValue === undefined || rawValue.trim() === '') {
      data[key] = [];
      listKey = key;
      continue;
    }
    listKey = null;
    const value = rawValue.trim();
    if (value.startsWith('[') || value.startsWith('{') || value === '|' || value === '>') {
      throw new ProjectSourceError(`받지 않는 값 모양: ${line}`, file);
    }
    data[key] =
      value.startsWith('"') || value.startsWith("'") ? unquote(value, file) : plainScalar(value);
  }
  return { data, body: normalized.slice(match[0].length) };
}

function requireString(data: Record<string, FrontmatterValue>, key: string, file: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim())
    throw new ProjectSourceError(`${key}가 비었거나 문자열이 아닙니다`, file);
  return value.trim();
}

function optionalString(
  data: Record<string, FrontmatterValue>,
  key: string,
  file: string,
): string | undefined {
  if (!(key in data)) return undefined;
  const value = data[key];
  if (typeof value !== 'string') throw new ProjectSourceError(`${key}가 문자열이 아닙니다`, file);
  return value.trim() || undefined;
}

function stringList(data: Record<string, FrontmatterValue>, key: string, file: string): string[] {
  if (!(key in data)) return [];
  const value = data[key];
  if (!Array.isArray(value)) throw new ProjectSourceError(`${key}가 목록이 아닙니다`, file);
  return value.map((item) => item.trim()).filter(Boolean);
}

// ───────────── project.md ─────────────

// 프로젝트 정보 (seriesMeta/<key>가 될 값)
export interface ProjectInfo {
  key: string;
  title: string;
  description: string;
  project: ProjectMeta;
  coverImage: string | null; // 옛 표지 경로. 옮기지 않는다(카드·OG는 코드 커버, U14). 보고서에만 적는다
}

// 옛 project.md에서 알고 있는 키 (모르는 키가 있으면 오류)
const PROJECT_META_KEYS = new Set([
  'entryType',
  'title',
  'description',
  'longDescription',
  'image',
  'tags',
  'tech',
  'github',
  'demo',
  'featured',
  'order',
  'startDate',
  'endDate',
]);

// project.md → 프로젝트 정보
export function parseProjectMetaFile(
  text: string,
  key: string,
  file = `${key}/project.md`,
): ProjectInfo {
  if (!SERIES_KEY_PATTERN.test(key))
    throw new ProjectSourceError(`프로젝트 key가 연재 key 형식이 아닙니다: ${key}`, file);
  const { data, body } = parseFrontmatter(text, file);
  for (const name of Object.keys(data)) {
    if (!PROJECT_META_KEYS.has(name)) throw new ProjectSourceError(`모르는 키: ${name}`, file);
  }
  if (data.entryType !== 'project')
    throw new ProjectSourceError('entryType이 project가 아닙니다', file);
  if (body.trim())
    throw new ProjectSourceError('project.md에 본문이 있습니다(옮길 곳이 없다)', file);

  const month = (name: string) => {
    if (!(name in data)) return undefined;
    const value = String(data[name]).trim();
    if (!PROJECT_MONTH_PATTERN.test(value))
      throw new ProjectSourceError(`${name}는 YYYY-MM이어야 합니다: ${value}`, file);
    return value;
  };
  const order = data.order ?? 0;
  if (typeof order !== 'number') throw new ProjectSourceError('order가 수가 아닙니다', file);
  const featured = data.featured ?? false;
  if (typeof featured !== 'boolean')
    throw new ProjectSourceError('featured가 참거짓이 아닙니다', file);

  const project: ProjectMeta = {
    longDescription: optionalString(data, 'longDescription', file) ?? '',
    tags: stringList(data, 'tags', file),
    tech: stringList(data, 'tech', file),
    featured,
    order,
  };
  const github = optionalString(data, 'github', file);
  const demo = optionalString(data, 'demo', file);
  const startDate = month('startDate');
  const endDate = month('endDate');
  if (github) project.github = github;
  if (demo) project.demo = demo;
  if (startDate) project.startDate = startDate;
  if (endDate) project.endDate = endDate;

  const parsed = projectMetaSchema.safeParse(project);
  if (!parsed.success) {
    throw new ProjectSourceError(
      `프로젝트 정보가 스키마에 맞지 않습니다: ${parsed.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
      file,
    );
  }

  return {
    key,
    title: requireString(data, 'title', file),
    description: requireString(data, 'description', file),
    project: parsed.data,
    coverImage: optionalString(data, 'image', file) ?? null,
  };
}

// ───────────── 프로젝트 글 ─────────────

export interface ProjectPostSource {
  key: string; // 프로젝트 key (= 연재 key)
  slug: string; // 파일 이름 (= 공개 주소의 마지막 칸)
  title: string;
  description: string;
  order: number; // Part 번호
  status: 'draft' | 'published';
  markdown: string; // 본문 (frontmatter 뒤, 앞쪽 빈 줄을 지우고 끝을 줄바꿈 하나로)
}

const PROJECT_POST_KEYS = new Set([
  'entryType',
  'title',
  'description',
  'project',
  'order',
  'chapterLabel',
  'status',
]);

// <slug>.md → 프로젝트 글
// - chapterLabel은 "Part <order>"만 받는다. 새 문서에는 칸이 없고, 화면이 "Part N"을 order로 만든다.
export function parseProjectPostFile(
  text: string,
  key: string,
  slug: string,
  file = `${key}/${slug}.md`,
): ProjectPostSource {
  const { data, body } = parseFrontmatter(text, file);
  for (const name of Object.keys(data)) {
    if (!PROJECT_POST_KEYS.has(name)) throw new ProjectSourceError(`모르는 키: ${name}`, file);
  }
  if (data.entryType !== 'post') throw new ProjectSourceError('entryType이 post가 아닙니다', file);
  if (data.project !== key)
    throw new ProjectSourceError(
      `project(${String(data.project)})가 폴더 이름(${key})과 다릅니다`,
      file,
    );
  if (!isValidSlug(slug))
    throw new ProjectSourceError(`파일 이름이 slug 형식이 아닙니다: ${slug}`, file);
  const order = data.order ?? 1;
  if (typeof order !== 'number' || !Number.isInteger(order) || order < 1) {
    throw new ProjectSourceError('order는 1 이상의 정수여야 합니다', file);
  }
  const chapterLabel = data.chapterLabel;
  if (chapterLabel !== undefined && chapterLabel !== `Part ${order}`) {
    throw new ProjectSourceError(
      `chapterLabel이 "Part ${order}"가 아닙니다: ${String(chapterLabel)}`,
      file,
    );
  }
  const status = data.status ?? 'published';
  if (status !== 'published' && status !== 'draft')
    throw new ProjectSourceError(`모르는 status: ${String(status)}`, file);

  const markdown = `${body.replace(/^(?:[ \t]*\n)+/, '').trimEnd()}\n`;
  if (!markdown.trim()) throw new ProjectSourceError('본문이 비었습니다', file);

  return {
    key,
    slug,
    title: requireString(data, 'title', file),
    description: requireString(data, 'description', file),
    order,
    status,
    markdown,
  };
}

// ───────────── 본문 이미지 ─────────────

// 프로젝트 이미지 상대 경로의 접두사 (src/content/projects/<key>/<slug>.md 기준)
export const PROJECT_IMAGE_PREFIX = '../../../assets/img/projects/';

export interface ProjectImageRef {
  alt: string;
  src: string; // 본문에 쓰인 주소 그대로
  repoPath: string; // 저장소 기준 경로 (src/assets/img/projects/<key>/<파일>)
}

// 본문에서 마크다운 이미지(![alt](주소))를 모두 찾는다
// - 코드 블록·인라인 코드 안은 건너뛴다.
// - 프로젝트 이미지 상대 경로가 아닌 이미지(http, /로 시작)는 그대로 둔다(돌려주지 않는다).
// - 그 밖의 상대 경로는 옮길 수 없으므로 오류다.
export function collectProjectImageRefs(markdown: string, file = ''): ProjectImageRef[] {
  const refs: ProjectImageRef[] = [];
  for (const segment of splitOutsideCode(markdown)) {
    if (segment.code) continue;
    for (const match of segment.text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) {
      const [, alt, src] = match;
      if (/^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('/') || src.startsWith('#')) continue;
      if (!src.startsWith(PROJECT_IMAGE_PREFIX)) {
        throw new ProjectSourceError(`옮길 수 없는 상대 경로 이미지: ${src}`, file);
      }
      const rest = src.slice(PROJECT_IMAGE_PREFIX.length);
      if (rest.split('/').some((part) => part === '..' || part === '.' || !part)) {
        throw new ProjectSourceError(`이미지 경로가 올바르지 않습니다: ${src}`, file);
      }
      refs.push({ alt, src, repoPath: `src/assets/img/projects/${rest}` });
    }
  }
  return refs;
}

// 본문의 프로젝트 이미지 주소를 바꾼다 (repoPath → 새 주소). 코드 안은 건드리지 않는다
export function rewriteProjectImages(
  markdown: string,
  urlByRepoPath: ReadonlyMap<string, string>,
  file = '',
): string {
  return splitOutsideCode(markdown)
    .map((segment) => {
      if (segment.code) return segment.text;
      return segment.text.replace(
        /!\[([^\]]*)\]\(([^)\s]+)\)/g,
        (whole, alt: string, src: string) => {
          if (!src.startsWith(PROJECT_IMAGE_PREFIX)) return whole;
          const repoPath = `src/assets/img/projects/${src.slice(PROJECT_IMAGE_PREFIX.length)}`;
          const url = urlByRepoPath.get(repoPath);
          if (!url) throw new ProjectSourceError(`새 주소가 없는 이미지: ${repoPath}`, file);
          return `![${alt}](${url})`;
        },
      );
    })
    .join('');
}

// 본문을 코드(펜스 블록·인라인 코드)와 그 밖으로 나눈다. 이어 붙이면 원문과 같다
export function splitOutsideCode(markdown: string): { text: string; code: boolean }[] {
  const result: { text: string; code: boolean }[] = [];
  const lines = markdown.split(/(?<=\n)/);
  let buffer = '';
  let fence: string | null = null;
  const flushText = () => {
    if (!buffer) return;
    // 인라인 코드(`…`)를 나눈다. 같은 길이의 백틱 묶음으로 닫힌다
    let rest = buffer;
    while (rest) {
      const open = /(`+)/.exec(rest);
      if (!open) {
        result.push({ text: rest, code: false });
        break;
      }
      const ticks = open[1];
      const closeIndex = rest.indexOf(ticks, open.index + ticks.length);
      if (closeIndex === -1) {
        result.push({ text: rest, code: false });
        break;
      }
      if (open.index > 0) result.push({ text: rest.slice(0, open.index), code: false });
      result.push({ text: rest.slice(open.index, closeIndex + ticks.length), code: true });
      rest = rest.slice(closeIndex + ticks.length);
    }
    buffer = '';
  };
  for (const line of lines) {
    const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) {
      result.push({ text: line, code: true });
      if (
        fenceMatch &&
        fenceMatch[1][0] === fence[0] &&
        fenceMatch[1].length >= fence.length &&
        !line.trim().slice(fenceMatch[1].length).trim()
      ) {
        fence = null;
      }
      continue;
    }
    if (fenceMatch) {
      flushText();
      fence = fenceMatch[1];
      result.push({ text: line, code: true });
      continue;
    }
    buffer += line;
  }
  flushText();
  return result;
}

// 본문 안 사이트 내부 링크(/blog/<slug> 등). 보고서에 적는다(이전 뒤에도 살아 있는지 사람이 본다)
export function collectInternalLinks(markdown: string): string[] {
  const links = new Set<string>();
  for (const segment of splitOutsideCode(markdown)) {
    if (segment.code) continue;
    for (const match of segment.text.matchAll(/(?<!!)\[[^\]]*\]\((\/[^)\s]*)\)/g))
      links.add(match[1]);
  }
  return [...links];
}

// ───────────── 해시와 ID ─────────────

// 원본 해시: .md 파일 바이트 + 본문 이미지(경로와 SHA-256, 경로 순)
// - 이미지만 바뀌어도 해시가 바뀐다. 재동기화 판정에 쓴다.
export function projectSourceHash(
  markdownFile: Uint8Array | string,
  images: readonly { repoPath: string; sha256: string }[],
): string {
  const hash = createHash('sha256');
  hash.update(markdownFile);
  for (const image of [...images].sort((a, b) => a.repoPath.localeCompare(b.repoPath))) {
    hash.update(`\n${image.repoPath}:${image.sha256}`);
  }
  return hash.digest('hex');
}

// 문서 ID는 고정이다. 다시 돌려도 같은 문서를 가리킨다(멱등)
export function projectEntryId(key: string, slug: string): string {
  return `project-${key}-${slug}`;
}

// ───────────── entries 문서 ─────────────

export interface ProjectEntryContext {
  sourcePath: string; // 저장소 기준 .md 경로
  sourceHash: string;
  markdown: string; // 이미지 주소를 바꾼 본문
  publishedAt: Date; // 원본 파일이 처음 커밋된 시각
  lastPublishedAt: Date; // 원본 파일이 마지막으로 커밋된 시각
  now: Date;
  previous?: {
    draftVersion: number;
    revision: number;
    createdAt: TimestampLike;
    publishedAt: TimestampLike | null;
  }; // 갱신이면 지금 entries 값
}

// 변환 결과. 시각은 Date다. 스크립트가 그대로 Firestore에 쓴다(Timestamp로 저장된다)
export interface ProjectEntryData {
  kind: 'project';
  status: EntryStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  lastPublishedAt: Date | null;
  slugHistory: string[];
  draft: ProjectEntryContent & { version: number; updatedAt: Date; device: null; editorJson: null };
  published:
    | (ProjectEntryContent & {
        revision: number;
        fromDraftVersion: number;
        readingTime: number;
        wordCount: number;
      })
    | null;
  legacy: null;
  projectSource: {
    path: string;
    sourceHash: string;
    syncedDraftVersion: number;
    syncedRevision: number;
    syncedStatus: EntryStatus;
    migratedAt: Date;
  };
}

interface ProjectEntryContent {
  title: string;
  description: string;
  slug: string;
  category: null;
  tags: string[];
  series: SeriesRef;
  cover: { kind: 'generated' };
  markdown: string;
}

const toDate = (value: TimestampLike) => new Date(toMillisValue(value));

// 프로젝트 글 1편 → entries 문서 1개
// - kind project, 카테고리 없음, 태그 없음, 연재 { key: 프로젝트, order: Part }, 코드 커버(D1 a).
// - 초안 글(status draft)은 발행본이 없다. 지금 원본 8편은 모두 발행 글이다.
// - 갱신이면 초안 버전·발행 번호를 하나씩 올리고 처음 만든 시각·첫 발행 시각은 그대로 둔다.
export function projectPostToEntry(
  post: ProjectPostSource,
  ctx: ProjectEntryContext,
): ProjectEntryData {
  const content: ProjectEntryContent = {
    title: post.title,
    description: post.description,
    slug: post.slug,
    category: null,
    tags: [],
    series: { key: post.key, order: post.order },
    cover: { kind: 'generated' },
    markdown: ctx.markdown,
  };
  const isPublic = post.status === 'published';
  const status: EntryStatus = isPublic ? 'published' : 'draft';
  const draftVersion = (ctx.previous?.draftVersion ?? 0) + 1;
  const revision = isPublic ? (ctx.previous?.revision ?? 0) + 1 : 0;
  const createdAt = ctx.previous ? toDate(ctx.previous.createdAt) : ctx.publishedAt;
  const firstPublishedAt = ctx.previous?.publishedAt
    ? toDate(ctx.previous.publishedAt)
    : ctx.publishedAt;
  const updatedAt = ctx.previous ? ctx.now : ctx.lastPublishedAt;

  return {
    kind: 'project',
    status,
    createdAt,
    updatedAt,
    publishedAt: isPublic ? firstPublishedAt : null,
    lastPublishedAt: isPublic ? (ctx.previous ? ctx.now : ctx.lastPublishedAt) : null,
    slugHistory: [],
    draft: { ...content, version: draftVersion, updatedAt, device: null, editorJson: null },
    published: isPublic
      ? {
          ...content,
          revision,
          fromDraftVersion: draftVersion,
          readingTime: calculateReadingTime(ctx.markdown),
          wordCount: countWords(ctx.markdown),
        }
      : null,
    legacy: null,
    projectSource: {
      path: ctx.sourcePath,
      sourceHash: ctx.sourceHash,
      syncedDraftVersion: draftVersion,
      // 스키마는 1 이상이다. 초안 글은 발행본이 없어 0이지만 지금 원본에는 초안 글이 없다
      syncedRevision: Math.max(revision, 1),
      syncedStatus: status,
      migratedAt: ctx.now,
    },
  };
}

// ───────────── 재동기화 판정 ─────────────

export type ProjectSyncDecision =
  | 'create'
  | 'update'
  | 'skip'
  | 'conflict'
  | 'skip-deleted-in-rebuild';

export interface ProjectSyncEntryState {
  status: EntryStatus;
  draftVersion: number;
  revision: number;
  projectSource: {
    sourceHash: string;
    syncedDraftVersion: number;
    syncedRevision: number;
    syncedStatus: EntryStatus;
  } | null;
}

// 원본 1편과 지금 entries 문서를 견준다 (2단계 Plan 5.4 재동기화와 같은 규칙)
// - 문서가 없으면 만든다. 단, 에디터로 지운 글(publishLog delete 기록)은 되살리지 않는다.
// - 원본 해시가 같으면 건너뛴다.
// - 원본이 바뀌었고 에디터로 고치지 않았으면 갱신한다. 에디터로도 고쳤으면 충돌(덮지 않고 보고만 한다).
// - 같은 ID인데 이전 표지가 없으면 사람이 봐야 한다(충돌).
export function decideProjectSync(input: {
  sourceHash: string;
  entry: ProjectSyncEntryState | null;
  deletedInRebuild: boolean;
}): ProjectSyncDecision {
  const { sourceHash, entry, deletedInRebuild } = input;
  if (!entry) return deletedInRebuild ? 'skip-deleted-in-rebuild' : 'create';
  if (!entry.projectSource) return 'conflict';
  // 원본이 그대로면 에디터로 고쳤든 아니든 할 일이 없다
  if (entry.projectSource.sourceHash === sourceHash) return 'skip';
  // 초안 글(발행본 없음)은 발행 번호가 0이다. 표지는 스키마 때문에 1 이상을 적었다
  const expectedRevision =
    entry.projectSource.syncedStatus === 'draft' ? 0 : entry.projectSource.syncedRevision;
  const changedInRebuild =
    entry.draftVersion !== entry.projectSource.syncedDraftVersion ||
    entry.revision !== expectedRevision ||
    entry.status !== entry.projectSource.syncedStatus;
  return changedInRebuild ? 'conflict' : 'update';
}

// 원본 안의 겹침 검사 (PR-C 리뷰 경미 7)
// - 문서 ID 겹침: key "a" + slug "b-c"와 key "a-b" + slug "c"는 같은 ID(project-a-b-c)가 된다.
// - slug 겹침: 두 프로젝트 폴더에 같은 파일 이름이 있으면 공개 slug가 같다(slug 공간이 하나다).
// - 겹치면 오류 글을 돌려준다. 스크립트는 아무것도 쓰지 않고 멈춘다.
export function findProjectSourceCollisions(
  posts: readonly { key: string; slug: string; file: string }[],
): string[] {
  const errors: string[] = [];
  const byId = new Map<string, string>();
  const bySlug = new Map<string, string>();
  for (const post of posts) {
    const id = projectEntryId(post.key, post.slug);
    const sameId = byId.get(id);
    if (sameId) errors.push(`문서 ID가 겹친다(${id}): ${sameId}, ${post.file}`);
    else byId.set(id, post.file);
    const sameSlug = bySlug.get(post.slug);
    if (sameSlug) errors.push(`slug가 겹친다(${post.slug}): ${sameSlug}, ${post.file}`);
    else bySlug.set(post.slug, post.file);
  }
  return errors;
}

// ───────────── 되돌리기 계획 (Plan 9.2, PR-C 리뷰 중요 2) ─────────────

export interface RollbackEntryState {
  id: string;
  status: EntryStatus;
  draftVersion: number;
  revision: number;
  seriesKeys: string[]; // 초안·발행본의 연재 key
  projectSource: {
    syncedDraftVersion: number;
    syncedRevision: number;
    syncedStatus: EntryStatus;
  } | null;
}

export interface RollbackAssetState {
  id: string;
  legacy: boolean;
  usedBy: string[];
}

// 이전 실행이 남긴 기록 (덤프 폴더의 migration.json). 지울 자산과 seriesMeta 문서를 이 기록으로만 고른다
export interface ProjectMigrationManifest {
  uploadedAssetIds: string[]; // 이 실행이 새로 올린 자산(같은 해시로 다시 쓴 자산은 넣지 않는다)
  createdSeriesMeta: string[]; // 이 실행이 새로 만든 seriesMeta 문서
}

export interface ProjectRollbackPlan {
  entries: string[]; // 지울 글
  editedEntries: string[]; // 이전 뒤 에디터로 고친 글(초안 버전·발행 번호·상태가 표지와 다르다)
  deleteAssets: string[]; // 문서와 Storage 파일을 지울 자산
  updateAssets: { id: string; usedBy: string[] }[]; // usedBy에서 지울 글만 뺄 자산
  deleteSeriesMeta: string[]; // 문서째 지울 seriesMeta
  clearProjectField: string[]; // project 칸만 지울 seriesMeta
}

// 되돌리기 대상을 고른다 (순수 함수)
// - 글: projectSource 표지가 있는 글. 에디터로 고친 글은 includeEdited가 아니면 빼고 따로 알린다.
// - 자산: 기록(manifest)에 있는 새로 올린 자산이고, 지울 글만 쓰고 있을 때만 지운다. Storage 파일은 되살릴 수 없다.
//   그 밖(기록이 없거나, 이전 뒤 에디터로 올린 이미지, 원래 있던 자산)은 usedBy에서 지울 글만 뺀다.
//   글을 남기면(에디터로 고친 글) 그 글이 쓰는 자산은 지우지 않는다.
// - seriesMeta: project 칸이 있는 문서. 남는 글이 그 key를 쓰면 칸만 지운다. 기록에 "새로 만든 문서"로 있으면 문서째 지운다.
export function planProjectRollback(input: {
  entries: readonly RollbackEntryState[];
  assets: readonly RollbackAssetState[];
  seriesMetaWithProject: readonly string[];
  manifest: ProjectMigrationManifest | null;
  includeEdited: boolean;
}): ProjectRollbackPlan {
  const migrated = input.entries.filter((entry) => entry.projectSource);
  const isEdited = (entry: RollbackEntryState) => {
    const source = entry.projectSource;
    if (!source) return false;
    const expectedRevision = source.syncedStatus === 'draft' ? 0 : source.syncedRevision;
    return (
      entry.draftVersion !== source.syncedDraftVersion ||
      entry.revision !== expectedRevision ||
      entry.status !== source.syncedStatus
    );
  };
  const editedEntries = migrated.filter(isEdited).map((entry) => entry.id);
  const targets = new Set(
    migrated.filter((entry) => input.includeEdited || !isEdited(entry)).map((entry) => entry.id),
  );
  const uploaded = new Set(input.manifest?.uploadedAssetIds ?? []);

  const deleteAssets: string[] = [];
  const updateAssets: { id: string; usedBy: string[] }[] = [];
  for (const asset of input.assets) {
    if (!asset.usedBy.some((id) => targets.has(id))) continue;
    const remaining = asset.usedBy.filter((id) => !targets.has(id));
    if (remaining.length === 0 && !asset.legacy && uploaded.has(asset.id))
      deleteAssets.push(asset.id);
    else updateAssets.push({ id: asset.id, usedBy: remaining });
  }

  const remainingKeys = new Set(
    input.entries.filter((entry) => !targets.has(entry.id)).flatMap((entry) => entry.seriesKeys),
  );
  const created = new Set(input.manifest?.createdSeriesMeta ?? []);
  const deleteSeriesMeta: string[] = [];
  const clearProjectField: string[] = [];
  for (const key of input.seriesMetaWithProject) {
    if (!remainingKeys.has(key) && created.has(key)) deleteSeriesMeta.push(key);
    else if (!remainingKeys.has(key)) clearProjectField.push(key);
    // 남는 글이 쓰는 프로젝트(에디터로 고쳐 남긴 글 등)는 건드리지 않는다
  }

  return {
    entries: [...targets],
    editedEntries,
    deleteAssets,
    updateAssets,
    deleteSeriesMeta,
    clearProjectField,
  };
}
