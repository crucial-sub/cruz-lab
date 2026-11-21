// 서가 화면 올리기 계획 (서가 1단계 T6, Plan J8·J10·J13·J15)
// - 끌어다 놓은(또는 고른) 파일 목록을 문서별 올리기 작업으로 나눈다.
// - I/O가 없는 순수 함수다. 파일 읽기·해시·전송은 화면 스크립트(library-page.ts)가 한다.
//
// 받는 꼴 (분석 1.4절의 실측 꼴):
// 1. 폴더 하나(꼴 b): 문서 한 편이 분명하면 그 문서가 진입 파일이다. 폴더 안 파일은 모두 자산이다.
// 2. 문서 파일 하나 + 자산(꼴 a): x.html + x-assets/… 처럼 이름(확장자 뺀 것)이 같은 문서 하나와 나머지 파일.
// 3. 같은 이름의 md와 html(짝): 작업 두 개가 된다. 같은 문서 키라서 서가에서 한 문서가 된다(J8).
// 4. 문서가 2편 이상이거나 모호하면 추측하지 않는다. NEEDS_CHOICE로 돌려주고 입구가 사용자에게 묻는다(폴더 2차 Plan L12, J57~J60).

// .ts 확장자: 맥 입구(client/push.ts)가 폴더 문서를 나눌 때 이 파일을 Node로 바로 가져온다
import { countHtmlDocLinks, findCssRefs, findHtmlRefs, findMarkdownRefs, missingRefs, type RefScan } from '../refs.ts';
import {
  contentTypeForPath,
  ENTRY_PATHS,
  MAX_FILE_COUNT,
  MAX_TOTAL_BYTES,
  normalizeDocPath,
  type DocFormat,
} from '../rules.ts';

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
  | 'NO_ENTRY_IN_FOLDER' // 폴더 뿌리에 문서가 없다
  | 'MIXED' // 폴더를 2개 이상 놓았다
  | 'NEEDS_CHOICE'; // 문서가 2편 이상이거나 모호하다. 사용자가 골라야 한다

// 폴더 뿌리에 있는 문서 파일 개수 (진입 파일을 정하지 못한 이유를 알릴 때 쓴다)
export interface RootDocCount {
  html: number;
  md: number;
}

// 뿌리의 문서 후보 하나. 같은 이름의 md·html은 한 항목이다
// - name: 형식 확장자를 뺀 이름
export interface ChoiceDoc {
  name: string;
  html: JobFile | null;
  md: JobFile | null;
}

// 사용자가 골라야 하는 폴더·파일 묶음 (J57·J60)
export interface DropChoice {
  folder: string | null; // 놓은 폴더 이름. 파일을 놓았으면 null
  docs: ChoiceDoc[]; // 뿌리의 문서 후보 (이름순)
  pool: JobFile[]; // 놓은 파일 전부(폴더 이름을 뗀 경로). 문서가 가리키는 자산을 여기서 찾는다
  entryOptions: string[]; // 문서 하나의 진입 파일 후보. folder가 null이면 빈 목록
  sourceCopies: string[]; // x.html 옆의 x.src.html(J59), 원본 옆의 x.phone.md
  subfolderDocs: number; // 올리지 않는 하위 폴더 문서 수 (L13). node_modules 안은 세지 않는다
}

// - rootDocs: NO_ENTRY_IN_FOLDER일 때만 있다
export type DropPlan =
  | { ok: true; jobs: UploadJob[]; skipped: SkippedFile[] }
  | { ok: false; error: 'NEEDS_CHOICE'; choice: DropChoice; skipped: SkippedFile[] }
  | { ok: false; error: Exclude<DropErrorCode, 'NEEDS_CHOICE'>; skipped: SkippedFile[]; rootDocs?: RootDocCount };

// 문서 형식 확장자
const DOC_EXTENSION = /\.(md|html)$/i;

function docFormatOf(path: string): DocFormat | null {
  const match = path.match(DOC_EXTENSION);
  return match ? (match[1].toLowerCase() as DocFormat) : null;
}

// 폴더를 읽는 파일 수 한도. 넘으면 잘라 판정하지 않고 멈춘다 (입구 모두 같다, J66)
export const MAX_FOLDER_FILES = 2000;

// 폴더 읽기 한도를 넘는가. 숨은 파일은 올리지 않으므로 세지 않는다
// - 폴더 고르기 입력은 .git 같은 숨은 파일까지 준다. 끌어다 놓기와 맥 입구는 숨은 파일을 읽지 않는다
export function exceedsFolderLimit(paths: readonly string[]): boolean {
  const visible = paths.filter((path) => !path.split('/').some((segment) => segment.startsWith('.')));
  return visible.length > MAX_FOLDER_FILES;
}

// 문서 후보를 셀 때 빼는 이름 (J58)
const README_NAME = /^readme$/i;

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
  key: { relativePath: (format: DocFormat) => string; fileName: (format: DocFormat) => string },
): UploadJob[] {
  const jobs: UploadJob[] = [];
  const keyOf = (format: DocFormat) => ({ relativePath: key.relativePath(format), fileName: key.fileName(format) });
  if (html) jobs.push(makeJob('html', html, assets, keyOf('html'), false));
  if (md) jobs.push(makeJob('md', md, assets, keyOf('md'), html !== null));
  return jobs;
}

// 뿌리의 md·html을 이름으로 묶는다
// - J59: x.html 옆의 x.src.html은 문서가 아니다
// - lab pull이 충돌 때 만드는 x.phone.md도 x의 사본이다. 문서로 올리면 공유 폴더에서 그대로 보인다
function groupRootDocs(files: readonly JobFile[]): { docs: ChoiceDoc[]; sourceCopies: string[] } {
  const groups = new Map<string, ChoiceDoc>();
  for (const file of files) {
    if (file.path.includes('/')) continue;
    const format = docFormatOf(file.path);
    if (!format) continue;
    const name = stem(file.path);
    const doc = groups.get(name) ?? { name, html: null, md: null };
    doc[format] ??= file;
    groups.set(name, doc);
  }
  const sourceCopies: string[] = [];
  for (const doc of groups.values()) {
    if (!doc.html || !doc.name.endsWith('.src')) continue;
    if (!groups.get(doc.name.slice(0, -'.src'.length))?.html) continue;
    sourceCopies.push(doc.html.path);
    doc.html = null;
  }
  for (const doc of groups.values()) {
    if (!doc.md || !doc.name.endsWith('.phone')) continue;
    const original = groups.get(doc.name.slice(0, -'.phone'.length));
    if (!original?.md && !original?.html) continue;
    sourceCopies.push(doc.md.path);
    doc.md = null;
  }
  const docs = [...groups.values()]
    .filter((doc) => doc.html || doc.md)
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return { docs, sourceCopies: sourceCopies.sort() };
}

// node_modules 안의 파일인가 (J66: 패키지 README를 문서로 세지 않는다)
const inNodeModules = (path: string) => path.split('/').includes('node_modules');

function makeChoice(folder: string | null, docs: ChoiceDoc[], sourceCopies: string[], pool: JobFile[]): DropChoice {
  return {
    folder,
    docs,
    pool,
    entryOptions: folder === null ? [] : docs.map((doc) => (doc.html ?? (doc.md as JobFile)).path),
    sourceCopies,
    subfolderDocs: pool.filter((file) => file.path.includes('/') && docFormatOf(file.path) && !inNodeModules(file.path)).length,
  };
}

// 문서 한 편을 폴더 키로 올리는 작업
// - 폴더 이름에는 점이 들어갈 수 있다. 제목 대체가 이름을 자르지 않게 형식 확장자를 붙인다.
// - 키(relativePath)에도 붙인다. 서버는 끝의 .md·.html을 떼고 같은 문서 키를 만든다(J8). 폴더 이름만 보내면
//   notes.md/ 같은 폴더가 notes/ 문서와 같은 키가 되어 그 문서의 앞 판을 갈아치운다(PR #36 리뷰 I6).
//   보통 폴더의 키는 그대로다(notes.html → notes).
function folderJobs(root: string, inner: JobFile[], doc: ChoiceDoc): UploadJob[] {
  const assets = inner.filter((file) => file !== doc.html && file !== doc.md);
  const withFormat = (format: DocFormat) => `${root}.${format}`;
  return jobsFor(doc.html, doc.md, assets, { relativePath: withFormat, fileName: withFormat });
}

// 폴더 하나(꼴 b)의 판정 순서 (J57·J58)
// ① 뿌리에 index.html → 문서 하나. ② 뿌리에 문서 없음 → 거부(개수를 돌려준다).
// ③ 세는 후보가 1개 이하 → 문서 하나. ④ 그 밖 → 사용자가 고른다.
// - README 이름의 md는 세지 않는다. 문서 하나가 되면 자산이고, 문서 모음이 되면 한 편이다.
function planFolder(root: string, kept: JobFile[]): UploadJob[] | RootDocCount | DropChoice {
  const inner = kept.map((file) => ({ ...file, path: file.path.slice(root.length + 1) }));
  const { docs, sourceCopies } = groupRootDocs(inner);

  const index = docs.find((doc) => doc.html?.path === 'index.html');
  if (index) return folderJobs(root, inner, index);
  if (docs.length === 0) return { html: 0, md: 0 };

  const named = docs.filter((doc) => doc.html || !README_NAME.test(doc.name));
  const counted = named.length > 0 ? named : docs;
  if (counted.length === 1) return folderJobs(root, inner, counted[0]);
  return makeChoice(root, docs, sourceCopies, inner);
}

// 뿌리에 놓은 파일들 (J60)
// - 문서 후보가 1개면 지금 규칙(문서 + 자산)이다. 2개 이상이면 사용자가 고른다. 사용자가 고른 README도 한 편으로 센다.
function planFiles(kept: JobFile[]): UploadJob[] | 'NO_DOC' | DropChoice {
  const { docs, sourceCopies } = groupRootDocs(kept);
  if (docs.length === 0) return 'NO_DOC';
  if (docs.length > 1) return makeChoice(null, docs, sourceCopies, kept);

  const { html, md } = docs[0];
  const assets = kept.filter((file) => file !== html && file !== md);
  const entry = (html ?? md) as JobFile;
  return jobsFor(html, md, assets, {
    relativePath: () => entry.path,
    fileName: (format) => (format === 'html' ? html : md)?.path ?? entry.path,
  });
}

// 놓은 파일 목록 → 올리기 작업들
export function planDrop(picked: readonly PickedFile[]): DropPlan {
  const { kept, skipped } = sortOut(picked);
  if (kept.length === 0) return { ok: false, error: 'EMPTY', skipped };

  const topFiles = kept.filter((file) => !file.path.includes('/'));
  const topDirs = new Set(kept.filter((file) => file.path.includes('/')).map((file) => file.path.split('/')[0]));

  if (topFiles.length === 0) {
    if (topDirs.size !== 1) return { ok: false, error: 'MIXED', skipped };
    const result = planFolder([...topDirs][0], kept);
    if (Array.isArray(result)) return { ok: true, jobs: result, skipped };
    if ('docs' in result) return { ok: false, error: 'NEEDS_CHOICE', choice: result, skipped };
    return { ok: false, error: 'NO_ENTRY_IN_FOLDER', skipped, rootDocs: result };
  }

  const result = planFiles(kept);
  if (result === 'NO_DOC') return { ok: false, error: 'NO_DOC', skipped };
  if (Array.isArray(result)) return { ok: true, jobs: result, skipped };
  return { ok: false, error: 'NEEDS_CHOICE', choice: result, skipped };
}

// ---------- 자산 따라가기 (J63) ----------

// 따라가며 알릴 것
// - missing: 문서가 가리키는데 없다
// - outside: 문서 밖 주소(../ 로 뿌리 위, / 로 시작)
// - type: 받지 않는 형식이라 넣지 않았다
// - skipped: 이름이 진입 파일과 겹쳐 뺐다
export type TraceNote = { kind: 'missing' | 'outside' | 'type' | 'skipped'; ref: string };

export interface AssetTrace<T> {
  assets: { path: string; file: T }[]; // 찾은 순서
  notes: TraceNote[]; // 같은 알림은 한 번만
}

// 진입 문서 하나에서 자산을 따라간다. 맥 파일 올리기(push.ts planFile)와 문서 모음이 같은 함수를 쓴다.
// 그래서 같은 파일은 어느 길로 올려도 같은 자산을 갖는다
// - md: md가 쓰는 그림만(링크는 넣지 않는다)
// - html: html·css가 가리키는 자산을 따라간다(css의 @import·url(), iframe html의 자산까지)
// - find(path): 그 경로의 파일. 없으면 null
// - readText(path, file): css·html 자산의 글. 읽지 못하면 undefined
export async function traceAssets<T>(
  format: DocFormat,
  entryText: string,
  find: (path: string) => T | null | Promise<T | null>,
  readText: (path: string, file: T) => Promise<string | undefined>,
): Promise<AssetTrace<T>> {
  const entryPath = ENTRY_PATHS[format];
  const assets: { path: string; file: T }[] = [];
  const included = new Set<string>([entryPath]);
  const notes: TraceNote[] = [];
  const noted = new Set<string>();
  const note = (kind: TraceNote['kind'], ref: string) => {
    const id = `${kind}\u0000${ref}`;
    if (noted.has(id)) return;
    noted.add(id);
    notes.push({ kind, ref });
  };

  const queue: { path: string | null; text: string }[] = [{ path: null, text: entryText }];
  while (queue.length > 0) {
    const item = queue.shift() as { path: string | null; text: string };
    const baseDir = item.path ? dirName(item.path) : '';
    let scan: RefScan;
    if (item.path === null) scan = format === 'md' ? findMarkdownRefs(item.text) : findHtmlRefs(item.text);
    else scan = /\.css$/i.test(item.path) ? findCssRefs(item.text, baseDir) : findHtmlRefs(item.text, baseDir);

    for (const ref of scan.outside) note('outside', ref);
    for (const path of scan.assets) {
      if (included.has(path)) {
        if (path === entryPath) note('skipped', path);
        continue;
      }
      if (!contentTypeForPath(path)) {
        note('type', path);
        continue;
      }
      const file = await find(path);
      if (file === null) {
        note('missing', path);
        continue;
      }
      if (assets.length + 1 > MAX_FILE_COUNT) break;
      included.add(path);
      assets.push({ path, file });
      // html 문서의 css·html 자산은 그 안의 주소도 따라간다
      if (format === 'html' && /\.(css|html)$/i.test(path)) {
        const text = await readText(path, file);
        if (text !== undefined) queue.push({ path, text });
      }
    }
  }
  return { assets, notes };
}

// ---------- 문서 모음 (J61·J63·J64·J66·J70) ----------

// 한 번의 문서 모음 한도 (J66). 파일·바이트는 문서마다 복사한 뒤의 합이다
export const MAX_COLLECTION_DOCS = 100;

export type CollectionLimit = 'TOO_MANY_DOCS' | 'TOO_MANY_FILES' | 'TOO_LARGE';

// 문서 하나의 요약
// - fileCount·bytes: 그 문서의 작업(짝이면 둘)을 합친 값
// - notes: 알림 전부. missing·outside는 카드가 바로 쓰는 값이다
export interface CollectionDoc {
  name: string;
  formats: DocFormat[];
  fileCount: number;
  bytes: number;
  missing: string[];
  outside: string[];
  notes: TraceNote[];
}

export interface CollectionPlan {
  jobs: UploadJob[]; // 작업마다 files가 확정 목록이다. 짝은 html 작업이 먼저다(J64)
  docs: CollectionDoc[];
  assets: string[]; // 문서가 쓰는 자산 (이름순, 중복 없음)
  sharedAssets: string[]; // 두 문서 이상이 쓰는 자산
  unusedFiles: string[]; // 아무도 안 써서 올리지 않는 파일
  htmlDocLinks: number; // HTML에서 모음 안의 다른 문서로 가는 링크 수 (서가에서 열리지 않는다)
  unreadDocs: string[]; // 글을 읽지 못해 자산을 찾지 못한 문서
  limitError: CollectionLimit | null;
}

// 문서 모음 계획. 올리기 전에 글자를 읽어 문서마다 자산을 정한다
// - readText(source): 놓은 목록의 경로로 읽은 글. 읽지 못하면 undefined(서가 화면은 5 MB가 넘는 파일)
// - options.exclude: 카드에서 끈 문서 이름 (L15). 끈 문서는 다른 문서의 자산으로도 들어가지 않는다
// - options.find: 자산을 찾는 함수. 없으면 놓은 파일에서 찾는다. 맥 입구는 파일로 올릴 때와 같이 디스크에서 찾는다(J63)
export async function planCollection(
  choice: DropChoice,
  readText: (source: string) => Promise<string | undefined>,
  options: { exclude?: ReadonlySet<string>; find?: (path: string) => Promise<JobFile | null> } = {},
): Promise<CollectionPlan> {
  const byPath = new Map(choice.pool.map((file) => [file.path, file]));
  const docFiles = new Set<string>();
  const excludedFiles = new Set<string>();
  for (const doc of choice.docs) {
    for (const file of [doc.html, doc.md]) {
      if (!file) continue;
      docFiles.add(file.path);
      if (options.exclude?.has(doc.name)) excludedFiles.add(file.path);
    }
  }
  const findAsset = async (path: string): Promise<JobFile | null> => {
    if (excludedFiles.has(path)) return null;
    return options.find ? options.find(path) : (byPath.get(path) ?? null);
  };
  const base = choice.folder === null ? '' : `${choice.folder}/`;
  const jobs: UploadJob[] = [];
  const docs: CollectionDoc[] = [];
  const unreadDocs: string[] = [];
  const usedBy = new Map<string, Set<string>>();
  let htmlDocLinks = 0;

  for (const doc of choice.docs) {
    if (options.exclude?.has(doc.name)) continue;
    const summary: CollectionDoc = { name: doc.name, formats: [], fileCount: 0, bytes: 0, missing: [], outside: [], notes: [] };
    let unread = false;
    for (const format of ['html', 'md'] as const) {
      const entry = doc[format];
      if (!entry) continue;
      const text = await readText(entry.source);
      if (text === undefined) unread = true;
      const trace = await traceAssets(
        format,
        text ?? '',
        findAsset,
        (_path, file) => readText(file.source),
      );
      const files: JobFile[] = [{ ...entry, path: ENTRY_PATHS[format] }, ...trace.assets.map(({ path, file }) => ({ ...file, path }))];
      jobs.push({ format, relativePath: `${base}${entry.path}`, fileName: entry.path, files, pool: [] });

      summary.formats.push(format);
      summary.fileCount += files.length;
      summary.bytes += files.reduce((sum, file) => sum + file.bytes, 0);
      for (const { path } of trace.assets) usedBy.set(path, (usedBy.get(path) ?? new Set()).add(doc.name));
      for (const item of trace.notes) {
        if (!summary.notes.some((known) => known.kind === item.kind && known.ref === item.ref)) summary.notes.push(item);
      }
      if (format === 'html' && text !== undefined) {
        // 짝 md로 가는 링크도 센다. html 판에는 그 파일이 없어 열리지 않는다
        htmlDocLinks += countHtmlDocLinks(text, (path) => docFiles.has(path) && path !== entry.path);
      }
    }
    summary.missing = summary.notes.filter((item) => item.kind === 'missing').map((item) => item.ref).sort();
    summary.outside = summary.notes.filter((item) => item.kind === 'outside').map((item) => item.ref).sort();
    if (unread) unreadDocs.push(doc.name);
    docs.push(summary);
  }

  const copies = new Set(choice.sourceCopies);
  const unusedFiles = choice.pool
    .map((file) => file.path)
    .filter(
      (path) =>
        !usedBy.has(path) &&
        !docFiles.has(path) &&
        !copies.has(path) &&
        !inNodeModules(path) &&
        !(path.includes('/') && docFormatOf(path)),
    )
    .sort();
  const fileTotal = jobs.reduce((sum, job) => sum + job.files.length, 0);
  const byteTotal = jobs.reduce((sum, job) => sum + job.files.reduce((total, file) => total + file.bytes, 0), 0);
  let limitError: CollectionLimit | null = null;
  if (docs.length > MAX_COLLECTION_DOCS) limitError = 'TOO_MANY_DOCS';
  else if (fileTotal > MAX_FILE_COUNT) limitError = 'TOO_MANY_FILES';
  else if (byteTotal > MAX_TOTAL_BYTES) limitError = 'TOO_LARGE';

  return {
    jobs,
    docs,
    assets: [...usedBy.keys()].sort(),
    sharedAssets: [...usedBy].filter(([, owners]) => owners.size > 1).map(([path]) => path).sort(),
    unusedFiles,
    htmlDocLinks,
    unreadDocs,
    limitError,
  };
}

// 한도를 넘은 이유 (서가 화면 카드와 맥 입구가 같은 글을 쓴다)
export function describeCollectionLimit(limit: CollectionLimit): string {
  if (limit === 'TOO_MANY_DOCS') return `문서가 ${MAX_COLLECTION_DOCS}편을 넘습니다. 문서를 끄거나 폴더를 나눕니다.`;
  if (limit === 'TOO_MANY_FILES') return `함께 쓰는 자산을 문서마다 넣으면 파일이 ${MAX_FILE_COUNT}개를 넘습니다. 문서를 끕니다.`;
  return `함께 쓰는 자산을 문서마다 넣으면 모두 ${MAX_TOTAL_BYTES / 1024 / 1024} MB를 넘습니다. 문서를 끕니다.`;
}

// 긴 목록은 앞 몇 개만 보인다
export function shortList(items: readonly string[], limit = 5): string {
  const head = items.slice(0, limit).join(', ');
  return items.length > limit ? `${head} 외 ${items.length - limit}개` : head;
}

// 문서 모음의 경고 글 (J69·J70). 서가 화면 카드와 맥 입구가 같은 글을 쓴다. 한도 글이 있으면 맨 앞이다
export function collectionWarnings(choice: DropChoice, collection: CollectionPlan): string[] {
  const lines: string[] = [];
  if (collection.limitError) lines.push(describeCollectionLimit(collection.limitError));
  if (collection.htmlDocLinks > 0) {
    lines.push(`HTML에서 다른 문서로 가는 링크 ${collection.htmlDocLinks}개는 서가에서 열리지 않습니다.`);
  }
  const missing = collection.docs.flatMap((doc) => doc.missing.map((path) => `${doc.name}: ${path}`));
  if (missing.length > 0) lines.push(`문서가 가리키는데 없는 파일 ${missing.length}개: ${shortList(missing)}`);
  const outside = collection.docs.flatMap((doc) => doc.outside.map((ref) => `${doc.name}: ${ref}`));
  if (outside.length > 0) lines.push(`문서 밖 주소 ${outside.length}개는 함께 올리지 않습니다: ${shortList(outside)}`);
  const unsupported = collection.docs.flatMap((doc) =>
    doc.notes.filter((note) => note.kind === 'type').map((note) => `${doc.name}: ${note.ref}`),
  );
  if (unsupported.length > 0) lines.push(`받지 않는 형식 ${unsupported.length}개: ${shortList(unsupported)} (함께 올리지 않습니다)`);
  if (collection.unreadDocs.length > 0) {
    lines.push(`5 MB가 넘어 읽지 못한 문서 ${collection.unreadDocs.length}편은 자산 없이 올라갑니다: ${shortList(collection.unreadDocs)}`);
  }
  if (collection.unusedFiles.length > 0) {
    lines.push(`안 올리는 파일 ${collection.unusedFiles.length}개: ${shortList(collection.unusedFiles)}`);
  }
  if (choice.sourceCopies.length > 0) lines.push(`.src.html·.phone.md 사본 ${choice.sourceCopies.length}개는 올리지 않습니다.`);
  if (choice.subfolderDocs > 0) lines.push(`하위 폴더 문서 ${choice.subfolderDocs}개는 올리지 않습니다.`);
  return lines;
}

// ---------- 문서 하나 + 고른 진입 파일 (J67·J68) ----------

// 고른 이름의 뿌리 문서. 뿌리 문서가 아니면 던진다(입구는 entryOptions로 먼저 거른다)
function entryDocOf(choice: DropChoice, entry: string): ChoiceDoc {
  const name = entry.normalize('NFC');
  const doc = choice.folder === null ? undefined : choice.docs.find((item) => item.html?.path === name || item.md?.path === name);
  if (!doc) throw new Error(`진입 파일은 폴더 뿌리의 문서만 고릅니다: ${entry}`);
  return doc;
}

// 진입 파일은 index.*와 원래 이름 두 경로로 넣는다. 다른 페이지가 원래 이름을 가리켜도 열린다(J68)
// - 진입 경로와 겹치는 다른 파일은 뺀다 (entryDroppedFiles가 알린다)
function entryJob(root: string, format: DocFormat, file: JobFile, others: JobFile[], pooled: boolean): UploadJob {
  const entryPath = ENTRY_PATHS[format];
  const head: JobFile[] = [{ ...file, path: entryPath }, ...(file.path === entryPath ? [] : [file])];
  const rest = others.filter((other) => other.path !== entryPath);
  const key = `${root}.${format}`;
  return { format, relativePath: key, fileName: key, files: pooled ? head : [...head, ...rest], pool: pooled ? rest : [] };
}

// 문서 하나 + 고른 진입 파일. 키는 폴더 키다. 같은 이름의 md가 있으면 짝으로 올린다
export function planEntry(choice: DropChoice, entry: string): UploadJob[] {
  const doc = entryDocOf(choice, entry);
  const root = choice.folder as string;
  const others = choice.pool.filter((file) => file !== doc.html && file !== doc.md);
  const jobs: UploadJob[] = [];
  if (doc.html) jobs.push(entryJob(root, 'html', doc.html, others, false));
  if (doc.md) jobs.push(entryJob(root, 'md', doc.md, others, doc.html !== null));
  return jobs;
}

// 진입 경로와 겹쳐 올리지 않는 파일
export function entryDroppedFiles(choice: DropChoice, entry: string): string[] {
  const doc = entryDocOf(choice, entry);
  const dropped: string[] = [];
  for (const format of ['html', 'md'] as const) {
    const file = doc[format];
    if (!file || file.path === ENTRY_PATHS[format]) continue;
    if (choice.pool.some((other) => other !== doc.html && other !== doc.md && other.path === ENTRY_PATHS[format])) {
      dropped.push(ENTRY_PATHS[format]);
    }
  }
  return dropped;
}

// ---------- 진입 파일 오류 글 ----------

// 폴더 뿌리에 문서가 없어 올리지 못한 이유와 할 일 (서가 화면과 맥 입구가 같은 글을 쓴다)
// - 뿌리에 문서가 있으면 planDrop이 바로 올리거나 NEEDS_CHOICE로 묻는다. 그래서 이 글은 문서가 없을 때의 글이다
export function describeFolderEntryError(rootDocs: RootDocCount): string {
  const head = '진입 파일을 정할 수 없습니다.';
  if (rootDocs.html === 0 && rootDocs.md === 0) {
    return `${head} 폴더 뿌리에 md·html 문서가 없습니다. 문서가 하위 폴더에 있으면 그 폴더를 올립니다.`;
  }
  return `${head} 폴더 뿌리의 문서 ${rootDocs.html + rootDocs.md}개 중 진입 파일을 고릅니다.`;
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
