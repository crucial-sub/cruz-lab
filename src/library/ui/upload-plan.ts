// 서가 화면 올리기 계획 (서가 1단계 T6, Plan J8·J10·J13·J15)
// - 끌어다 놓은(또는 고른) 파일 목록을 문서별 올리기 작업으로 나눈다.
// - I/O가 없는 순수 함수다. 파일 읽기·해시·전송은 화면 스크립트(library-page.ts)가 한다.
//
// 받는 꼴 (분석 1.4절의 실측 꼴):
// 1. 폴더 하나(꼴 b): 폴더 뿌리의 index.html(없으면 하나뿐인 html)이 진입 파일이다. 폴더 안 파일은 모두 자산이다.
// 2. 문서 파일 하나 + 자산(꼴 a): x.html + x-assets/… 처럼 이름(확장자 뺀 것)이 같은 문서 하나와 나머지 파일.
// 3. 같은 이름의 md와 html(짝): 작업 두 개가 된다. 같은 문서 키라서 서가에서 한 문서가 된다(J8).
// 4. 자산 없는 문서 파일 여러 개: 문서마다 작업 하나.
// 그 밖(여러 문서 + 자산)은 어느 자산이 어느 문서 것인지 알 수 없어 거부한다.

import { findCssRefs, findHtmlRefs, findMarkdownRefs, missingRefs } from '../refs';
import { contentTypeForPath, ENTRY_PATHS, normalizeDocPath, type DocFormat } from '../rules';

// 놓은 파일 하나. path는 놓은 자리 기준 상대 경로다(폴더를 놓으면 폴더 이름부터)
export interface PickedFile {
  path: string;
  bytes: number;
}

// 작업에 든 파일 하나
// - source: 놓은 목록의 경로(파일을 다시 찾는 열쇠)
// - path: 문서 안 경로(서버에 보내는 값)
export interface JobFile {
  source: string;
  path: string;
  bytes: number;
}

// 올리기 작업 하나 = 서버의 올리기 시작 요청 하나
// - relativePath: 같은 문서 키(J8)에 쓰는 올린 상대 경로. 확장자는 서버가 뺀다
// - fileName: 제목을 뽑지 못했을 때 쓰는 이름, 날짜(YYYY-MM-DD)를 뽑는 이름(J13)
// - files: 확정한 파일(진입 파일 포함)
// - pool: md 짝 작업만. 이 중 md가 가리키는 그림만 골라 넣는다(html 판의 자산을 md 판에 겹쳐 싣지 않는다)
export interface UploadJob {
  format: DocFormat;
  relativePath: string;
  fileName: string;
  files: JobFile[];
  pool: JobFile[];
}

export type SkipReason = 'hidden' | 'name' | 'type';

export interface SkippedFile {
  path: string;
  reason: SkipReason;
}

export type DropErrorCode =
  | 'EMPTY' // 받을 파일이 하나도 없다
  | 'NO_DOC' // md·html 문서가 없다
  | 'NO_ENTRY_IN_FOLDER' // 폴더 뿌리에 진입 파일을 정할 수 없다
  | 'MIXED'; // 여러 문서와 자산이 섞였다

export type DropPlan =
  | { ok: true; jobs: UploadJob[]; skipped: SkippedFile[] }
  | { ok: false; error: DropErrorCode; skipped: SkippedFile[] };

// 문서 형식 확장자
const DOC_EXTENSION = /\.(md|html)$/i;

function docFormatOf(path: string): DocFormat | null {
  const match = path.match(DOC_EXTENSION);
  return match ? (match[1].toLowerCase() as DocFormat) : null;
}

// 형식 확장자를 뺀 이름
function stem(name: string): string {
  return name.replace(DOC_EXTENSION, '');
}

// 경로의 폴더 부분 ('' = 뿌리)
function dirName(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

// 놓은 경로를 맞추고, 받을 수 없는 파일을 거른다
// - 숨은 파일(.DS_Store, .git/…)은 말없이 거른다(목록에는 남긴다)
function sortOut(picked: readonly PickedFile[]): { kept: JobFile[]; skipped: SkippedFile[] } {
  const kept: JobFile[] = [];
  const skipped: SkippedFile[] = [];
  const seen = new Set<string>();
  for (const file of picked) {
    const path = file.path.normalize('NFC').replace(/^\/+/, '');
    if (seen.has(path)) continue;
    seen.add(path);
    if (path.split('/').some((segment) => segment.startsWith('.'))) {
      skipped.push({ path, reason: 'hidden' });
    } else if (!normalizeDocPath(path)) {
      skipped.push({ path, reason: 'name' });
    } else if (!contentTypeForPath(path)) {
      skipped.push({ path, reason: 'type' });
    } else {
      kept.push({ source: file.path, path, bytes: file.bytes });
    }
  }
  return { kept, skipped };
}

// 진입 파일 이름을 바꾸고(J4: index.html / index.md) 나머지는 문서 뿌리 기준 경로로 둔다
function makeJob(
  format: DocFormat,
  entry: JobFile,
  others: JobFile[],
  key: { relativePath: string; fileName: string },
  pooled: boolean,
): UploadJob {
  const entryFile = { ...entry, path: ENTRY_PATHS[format] };
  return {
    format,
    relativePath: key.relativePath,
    fileName: key.fileName,
    files: pooled ? [entryFile] : [entryFile, ...others],
    pool: pooled ? others : [],
  };
}

// 진입 파일 html·md 한 쌍(둘 중 하나는 없을 수 있다)으로 작업을 만든다
// - 짝이면 html 작업이 자산을 모두 갖고, md 작업은 그림만 고른다(pool)
// - md만 있으면 md 작업이 자산을 모두 갖는다
function jobsFor(
  html: JobFile | null,
  md: JobFile | null,
  assets: JobFile[],
  key: { relativePath: string; fileName: (format: DocFormat) => string },
): UploadJob[] {
  const jobs: UploadJob[] = [];
  if (html) jobs.push(makeJob('html', html, assets, { relativePath: key.relativePath, fileName: key.fileName('html') }, false));
  if (md) jobs.push(makeJob('md', md, assets, { relativePath: key.relativePath, fileName: key.fileName('md') }, html !== null));
  return jobs;
}

// 폴더 하나(꼴 b)
function planFolder(root: string, kept: JobFile[]): UploadJob[] | null {
  const inner = kept.map((file) => ({ ...file, path: file.path.slice(root.length + 1) }));
  const atRoot = inner.filter((file) => !file.path.includes('/'));
  const htmls = atRoot.filter((file) => docFormatOf(file.path) === 'html');
  const mds = atRoot.filter((file) => docFormatOf(file.path) === 'md');

  // html 진입: index.html, 없으면 뿌리에 하나뿐인 html
  const html = htmls.find((file) => file.path === 'index.html') ?? (htmls.length === 1 ? htmls[0] : null);
  // md 진입: html이 있으면 이름이 같은 md만 짝이다(README.md 같은 파일은 자산이다)
  //          html이 없으면 index.md, 없으면 뿌리에 하나뿐인 md
  const md = html
    ? (mds.find((file) => stem(file.path) === stem(html.path)) ?? null)
    : (mds.find((file) => file.path === 'index.md') ?? (mds.length === 1 ? mds[0] : null));
  if (!html && !md) return null;

  const assets = inner.filter((file) => file !== html && file !== md);
  // 폴더 이름에는 점이 들어갈 수 있다. 제목 대체가 이름을 자르지 않게 형식 확장자를 붙인다
  return jobsFor(html, md, assets, { relativePath: root, fileName: (format) => `${root}.${format}` });
}

// 뿌리에 놓은 파일들
function planFiles(kept: JobFile[]): UploadJob[] | 'NO_DOC' | 'MIXED' {
  const docs = kept.filter((file) => !file.path.includes('/') && docFormatOf(file.path));
  if (docs.length === 0) return 'NO_DOC';
  const stems = new Map<string, JobFile[]>();
  for (const doc of docs) {
    const name = stem(doc.path);
    stems.set(name, [...(stems.get(name) ?? []), doc]);
  }

  const pick = (group: JobFile[]) => ({
    html: group.find((file) => docFormatOf(file.path) === 'html') ?? null,
    md: group.find((file) => docFormatOf(file.path) === 'md') ?? null,
  });

  // 문서 하나(짝 포함) + 자산
  if (stems.size === 1) {
    const { html, md } = pick(docs);
    const assets = kept.filter((file) => file !== html && file !== md);
    const entry = (html ?? md) as JobFile;
    return jobsFor(html, md, assets, {
      relativePath: entry.path,
      fileName: (format) => (format === 'html' ? html : md)?.path ?? entry.path,
    });
  }

  // 자산 없는 문서 여러 개
  if (docs.length !== kept.length) return 'MIXED';
  const jobs: UploadJob[] = [];
  for (const group of stems.values()) {
    const { html, md } = pick(group);
    const entry = (html ?? md) as JobFile;
    jobs.push(
      ...jobsFor(html, md, [], {
        relativePath: entry.path,
        fileName: (format) => (format === 'html' ? html : md)?.path ?? entry.path,
      }),
    );
  }
  return jobs;
}

// 놓은 파일 목록 → 올리기 작업들
export function planDrop(picked: readonly PickedFile[]): DropPlan {
  const { kept, skipped } = sortOut(picked);
  if (kept.length === 0) return { ok: false, error: 'EMPTY', skipped };

  const topFiles = kept.filter((file) => !file.path.includes('/'));
  const topDirs = new Set(kept.filter((file) => file.path.includes('/')).map((file) => file.path.split('/')[0]));

  if (topFiles.length === 0) {
    if (topDirs.size !== 1) return { ok: false, error: 'MIXED', skipped };
    const jobs = planFolder([...topDirs][0], kept);
    return jobs ? { ok: true, jobs, skipped } : { ok: false, error: 'NO_ENTRY_IN_FOLDER', skipped };
  }

  const jobs = planFiles(kept);
  return typeof jobs === 'string' ? { ok: false, error: jobs, skipped } : { ok: true, jobs, skipped };
}

// ---------- 빠진 자산 (J15) ----------

// 화면 스크립트가 글자로 읽어야 하는 파일: 진입 파일, 그리고 html 작업의 css·html
export function textSourcesFor(job: UploadJob): string[] {
  const sources = [job.files[0].source];
  if (job.format === 'html') {
    for (const file of job.files.slice(1)) {
      if (/\.(css|html)$/i.test(file.path)) sources.push(file.source);
    }
  }
  return sources;
}

export interface JobAnalysis {
  job: UploadJob; // md 짝 작업이면 고른 그림이 files에 들어간 작업
  missing: string[]; // 문서가 가리키는데 올리는 목록에 없는 자산
  outside: string[]; // 문서 밖(../, /)을 가리키는 주소
}

// 진입 파일·css·html의 상대 주소를 읽어 빠진 자산을 찾는다
// - readText(source): 글자로 읽은 내용. 읽지 않은 파일이면 undefined
export function analyzeJob(job: UploadJob, readText: (source: string) => string | undefined): JobAnalysis {
  const assets = new Set<string>();
  const outside = new Set<string>();
  const add = (scan: { assets: string[]; outside: string[] }) => {
    for (const path of scan.assets) assets.add(path);
    for (const ref of scan.outside) outside.add(ref);
  };

  const entryText = readText(job.files[0].source) ?? '';
  if (job.format === 'md') {
    add(findMarkdownRefs(entryText));
  } else {
    add(findHtmlRefs(entryText));
    for (const file of job.files.slice(1)) {
      const text = /\.(css|html)$/i.test(file.path) ? readText(file.source) : undefined;
      if (text === undefined) continue;
      const scan = /\.css$/i.test(file.path) ? findCssRefs(text, dirName(file.path)) : findHtmlRefs(text, dirName(file.path));
      add(scan);
    }
  }

  // md 짝: 가리키는 그림만 pool에서 골라 넣는다
  let files = job.files;
  if (job.pool.length > 0) {
    const chosen = job.pool.filter((file) => assets.has(file.path));
    files = [...job.files, ...chosen];
  }
  const present = files.map((file) => file.path);
  return {
    job: { ...job, files, pool: [] },
    missing: missingRefs(assets, present).sort(),
    outside: [...outside].sort(),
  };
}
