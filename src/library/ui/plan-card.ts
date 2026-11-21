// 서가 화면 계획 카드 (폴더 2차 Plan T4, L12·L15, J62·J69·J71~J73)
// - 문서가 2편 이상이거나 모호한 폴더를 올리기 전에 결과를 보이고 고르게 한다.
// - 판정은 하지 않는다. 판정과 자산 계산은 upload-plan.ts가 한다.
// - 앞부분은 DOM이 없는 상태·글·흐름 함수다(tests/library/plan-card.test.ts). 뒷부분이 카드 DOM이다.
// - 사용자 값은 textContent로만 넣는다.

import { docKeyFromWebPath } from '../rules';
import { docFolder, sharedByLines, shareCoversDoc, type ShareScope } from '../share';
import {
  collectionWarnings,
  entryDroppedFiles,
  planCollection,
  planEntry,
  shortList,
  type ChoiceDoc,
  type CollectionPlan,
  type DropChoice,
  type UploadJob,
} from './upload-plan';

// ---------- 상태 ----------

export interface CardState {
  mode: 'each' | 'entry';
  entry: string | null; // 문서 하나의 진입 파일. 파일을 놓았으면 null
  excluded: ReadonlySet<string>; // 끈 문서 이름 (L15)
}

export type CardDecision = { mode: 'each'; exclude: ReadonlySet<string> } | { mode: 'entry'; entry: string };

// 처음 상태: 문서 모음, 모든 문서 켬 (J57 기본 선택)
export function initialCardState(choice: DropChoice): CardState {
  return { mode: 'each', entry: choice.entryOptions[0] ?? null, excluded: new Set() };
}

export function selectMode(state: CardState, mode: CardState['mode']): CardState {
  return { ...state, mode };
}

export function selectEntry(state: CardState, entry: string): CardState {
  return { ...state, entry };
}

export function toggleDoc(state: CardState, name: string): CardState {
  const excluded = new Set(state.excluded);
  if (!excluded.delete(name)) excluded.add(name);
  return { ...state, excluded };
}

export function decisionOf(state: CardState): CardDecision {
  if (state.mode === 'entry' && state.entry !== null) return { mode: 'entry', entry: state.entry };
  return { mode: 'each', exclude: state.excluded };
}

// 올리기 단추를 켤 수 있는가
export function canSubmit(state: CardState, collection: CollectionPlan): boolean {
  if (state.mode === 'entry') return state.entry !== null;
  return collection.docs.length > 0 && collection.limitError === null;
}

// ---------- 문서 id와 공유 경고 (J62·J71) ----------

// 같은 문서 키 → 문서 id. 서버의 docIdForKey와 같은 값을 Web Crypto로 만든다
export async function webDocId(key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key.normalize('NFC')));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

const entryFileOf = (doc: ChoiceDoc) => (doc.html ?? doc.md) as NonNullable<ChoiceDoc['html']>;

// 폴더 없이 올린 같은 이름의 문서가 서가에 있는 문서 이름 (J62). 옮기지 않고 알리기만 한다
// - 파일을 놓았으면 키가 그대로라 같은 문서다
export async function findLegacyDocs(choice: DropChoice, project: string, existingIds: ReadonlySet<string>): Promise<string[]> {
  if (choice.folder === null) return [];
  const names: string[] = [];
  for (const doc of choice.docs) {
    if (existingIds.has(await webDocId(docKeyFromWebPath(project, entryFileOf(doc).path)))) names.push(doc.name);
  }
  return names;
}

// 이미 서가에 있는 같은 키의 문서 (리뷰 I4). 올리면 그 문서의 새 판이 된다
export interface ReplacedDocs {
  names: string[]; // 문서 모음으로 올릴 때 바뀌는 문서
  folderDoc: boolean; // 문서 하나로 올릴 때 바뀌는 폴더 문서가 있다
}

export async function findReplacedDocs(choice: DropChoice, project: string, existingIds: ReadonlySet<string>): Promise<ReplacedDocs> {
  const base = choice.folder === null ? '' : `${choice.folder}/`;
  const names: string[] = [];
  for (const doc of choice.docs) {
    if (existingIds.has(await webDocId(docKeyFromWebPath(project, `${base}${entryFileOf(doc).path}`)))) names.push(doc.name);
  }
  const folderDoc = choice.folder !== null && existingIds.has(await webDocId(docKeyFromWebPath(project, `${choice.folder}.html`)));
  return { names, folderDoc };
}

export interface ShareInfo {
  scope: ShareScope;
  label: string;
}

// 올리면 어느 살아 있는 공유에 드는가 (J71). 범위 판정은 shareCoversDoc 하나다
export async function sharedLabelsFor(
  choice: DropChoice,
  project: string,
  state: CardState,
  shares: readonly ShareInfo[],
): Promise<string[]> {
  const base = choice.folder === null ? '' : `${choice.folder}/`;
  const keys =
    state.mode === 'entry'
      ? [docKeyFromWebPath(project, `${choice.folder}.html`)]
      : choice.docs
          .filter((doc) => !state.excluded.has(doc.name))
          .map((doc) => docKeyFromWebPath(project, `${base}${entryFileOf(doc).path}`));
  const infos = await Promise.all(keys.map(async (key) => ({ id: await webDocId(key), project, folder: docFolder(key) })));
  const labels = shares.filter((share) => infos.some((info) => shareCoversDoc(share.scope, info))).map((share) => share.label);
  return [...new Set(labels)];
}

// ---------- 경고 글 (J69·J70) ----------

export function cardWarnings(input: {
  choice: DropChoice;
  state: CardState;
  collection: CollectionPlan;
  legacy: readonly string[];
  shared: readonly string[];
  replaced?: ReplacedDocs;
}): string[] {
  const { choice, state, collection, legacy, shared, replaced } = input;
  const lines: string[] = [];
  const sharedLines = shared.map((label) => `공유 중인 '${label}'에 들어갑니다. 주소를 아는 사람이 올린 문서를 읽습니다.`);

  if (state.mode === 'entry') {
    lines.push(...sharedLines);
    if (replaced?.folderDoc) lines.push('이미 서가에 있는 이 폴더 문서가 새 판으로 바뀝니다.');
    if (state.entry !== null) {
      const dropped = entryDroppedFiles(choice, state.entry);
      if (dropped.length > 0) lines.push(`진입 경로와 겹쳐 뺀 파일: ${shortList(dropped)}`);
      const doc = choice.docs.find((item) => item.html?.path === state.entry || item.md?.path === state.entry);
      if (doc && !(doc.html && doc.md)) lines.push('이 문서에 앞서 올린 다른 형식이 있으면 그대로 남습니다.');
    }
    return lines;
  }

  // 한도 글이 있으면 맨 앞에 둔다. 공유 경고는 그다음이다
  const common = collectionWarnings(choice, collection);
  const head = collection.limitError ? 1 : 0;
  const legacyLeft = legacy.filter((name) => !state.excluded.has(name));
  const legacyLines = legacyLeft.length > 0 ? [`폴더 없이 올린 같은 이름의 문서 ${legacyLeft.length}편이 서가에 남습니다.`] : [];
  const replacedLeft = (replaced?.names ?? []).filter((name) => !state.excluded.has(name));
  const replacedLines = replacedLeft.length > 0 ? [`이미 서가에 있는 문서 ${replacedLeft.length}편은 새 판으로 바뀝니다.`] : [];
  return [...common.slice(0, head), ...sharedLines, ...replacedLines, ...common.slice(head), ...legacyLines];
}

// ---------- 흐름 ----------

export interface ChoiceFlowDeps {
  // 카드를 보이고 결정을 받는다. 취소면 null. recompute: 끈 문서를 뺀 계획을 다시 세운다
  ask(collection: CollectionPlan, recompute: (exclude: ReadonlySet<string>) => Promise<CollectionPlan>): Promise<CardDecision | null>;
  uploadEach(plan: CollectionPlan): Promise<void>;
  uploadEntry(jobs: UploadJob[]): Promise<void>;
}

// 계획 → 카드 → 올리기. 취소하면 올리기 요청이 하나도 나가지 않는다(C23)
export async function runChoiceFlow(
  choice: DropChoice,
  readText: (source: string) => Promise<string | undefined>,
  deps: ChoiceFlowDeps,
): Promise<'cancelled' | 'each' | 'entry'> {
  const recompute = (exclude: ReadonlySet<string>) => planCollection(choice, readText, { exclude });
  const decision = await deps.ask(await planCollection(choice, readText), recompute);
  if (!decision) return 'cancelled';
  if (decision.mode === 'entry') {
    await deps.uploadEntry(planEntry(choice, decision.entry));
    return 'entry';
  }
  const plan = await recompute(decision.exclude);
  if (plan.jobs.length === 0 || plan.limitError) return 'cancelled';
  await deps.uploadEach(plan);
  return 'each';
}

// ---------- 문서 모음 결과 (J73) ----------

export interface UploadOutcome {
  name: string; // 문서 이름 (짝은 같은 이름)
  doc?: { id: string; title: string; url: string };
  sharedBy?: unknown;
  error?: string;
}

export interface UploadSummaryRow {
  name: string;
  title: string;
  docId: string | null;
  error: string | null;
  warnings: string[];
}

// 작업 결과 → 문서마다 한 줄. 짝의 한쪽이라도 실패하면 그 문서는 실패다
export function summarizeUploads(outcomes: readonly UploadOutcome[]): { uploaded: number; failed: number; rows: UploadSummaryRow[] } {
  const rows = new Map<string, UploadSummaryRow>();
  for (const outcome of outcomes) {
    const row = rows.get(outcome.name) ?? { name: outcome.name, title: outcome.name, docId: null, error: null, warnings: [] };
    if (outcome.doc) {
      row.title = outcome.doc.title;
      row.docId = outcome.doc.id;
    }
    if (outcome.error) row.error = row.error ?? outcome.error;
    row.warnings = [...new Set([...row.warnings, ...sharedByLines(outcome.sharedBy)])];
    rows.set(outcome.name, row);
  }
  const list = [...rows.values()];
  const failed = list.filter((row) => row.error !== null).length;
  return { uploaded: list.length - failed, failed, rows: list };
}

// ---------- DOM ----------

export const BUTTON = 'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-bg-card';
export const PRIMARY = 'rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-hover';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// 글자와 자식으로 요소를 만든다 (사용자 값은 textContent로만 넣는다)
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { class?: string; text?: string } = {},
  ...children: (Node | null)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  for (const child of children) if (child) node.append(child);
  return node;
}

// 터치 대상 44px 이상 (J72)
const OPTION_ROW = 'flex min-h-11 cursor-pointer items-center gap-2';
const CARD_BUTTON = 'min-h-11 md:min-h-0';

export interface PlanCardInput {
  choice: DropChoice;
  collection: CollectionPlan;
  project: string;
  legacy: readonly string[];
  replaced: ReplacedDocs;
  shares: readonly ShareInfo[];
  recompute: (exclude: ReadonlySet<string>) => Promise<CollectionPlan>;
}

// 계획 카드를 열고 결정을 기다린다. 취소면 null
export function openPlanCard(container: HTMLElement, input: PlanCardInput): Promise<CardDecision | null> {
  const { choice, project, legacy, replaced, shares, recompute } = input;
  let state = initialCardState(choice);
  let collection = input.collection;
  let shared: string[] = [];
  // 처음 계획의 문서 요약. 끈 문서도 목록에 남겨야 다시 켤 수 있다
  const firstDocs = new Map(input.collection.docs.map((doc) => [doc.name, doc]));

  return new Promise((resolve) => {
    const titleId = 'plan-card-title';
    const title = choice.folder === null ? `문서 ${choice.docs.length}편을 어떻게 올릴까요?` : `${choice.folder} 폴더를 어떻게 올릴까요?`;
    const box = el('section', { class: 'min-w-0 rounded-lg border border-brand/50 px-4 py-3 text-sm' });
    box.setAttribute('aria-labelledby', titleId);
    const heading = el('h3', { class: 'break-words font-medium', text: title });
    heading.id = titleId;
    box.append(heading);

    // 방식 고르기. 파일을 놓았으면 폴더 이름이 없어 문서 모음만 있다(J72)
    const radio = (value: CardState['mode'], label: string, hint: string) => {
      const input = el('input', { class: 'size-4 shrink-0 accent-[var(--brand)]' });
      input.type = 'radio';
      input.name = 'plan-card-mode';
      input.value = value;
      input.checked = value === state.mode;
      input.addEventListener('change', () => {
        state = selectMode(state, value);
        void refresh();
      });
      return el(
        'label',
        { class: OPTION_ROW },
        input,
        el(
          'span',
          { class: 'min-w-0 flex-1 py-1' },
          el('span', { class: 'block font-medium', text: label }),
          el('span', { class: 'block text-xs text-text-secondary', text: hint }),
        ),
      );
    };
    if (choice.folder !== null) {
      const modes = el('fieldset', { class: 'mt-2' });
      modes.append(
        el('legend', { class: 'sr-only', text: '올리는 방식' }),
        radio('each', `문서 모음 ${choice.docs.length}편`, '문서마다 따로 열고, 검색하고, 폰에서 고칩니다.'),
        radio('entry', '문서 하나', '폴더 전체를 한 문서로 올립니다. 진입 파일을 고릅니다.'),
      );
      box.append(modes);
    }

    // 문서 목록과 체크 칸 (L15)
    const docList = el('ul', { class: 'mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border' });
    for (const doc of choice.docs) {
      const summary = firstDocs.get(doc.name);
      const check = el('input', { class: 'size-4 shrink-0 accent-[var(--brand)]' });
      check.type = 'checkbox';
      check.checked = true;
      check.addEventListener('change', () => {
        state = toggleDoc(state, doc.name);
        void refresh(true);
      });
      const meta = summary
        ? `${summary.formats.join('·')} · 파일 ${summary.fileCount}개 · ${formatBytes(summary.bytes)}`
        : '';
      docList.append(
        el(
          'li',
          {},
          el(
            'label',
            { class: `${OPTION_ROW} px-2.5` },
            check,
            el(
              'span',
              { class: 'min-w-0 flex-1 py-1' },
              el('span', { class: 'block break-all', text: doc.name }),
              el('span', { class: 'block text-xs text-text-secondary', text: meta }),
            ),
          ),
        ),
      );
    }

    // 진입 파일 고르기 (J67)
    const entrySelect = el('select', { class: 'mt-1 w-full min-w-0 rounded-md border border-border bg-bg-app px-2.5 py-2 text-sm text-text-primary' });
    entrySelect.id = 'plan-card-entry';
    for (const name of choice.entryOptions) {
      const option = el('option', { text: name });
      option.value = name;
      entrySelect.append(option);
    }
    entrySelect.addEventListener('change', () => {
      state = selectEntry(state, entrySelect.value);
      void refresh();
    });
    const entryLabel = el('label', { class: 'block text-xs text-text-secondary', text: '진입 파일' });
    entryLabel.htmlFor = entrySelect.id;
    const entryPanel = el('div', { class: 'mt-2' }, entryLabel, entrySelect);

    const summaryLine = el('p', { class: 'mt-2 text-xs text-text-secondary' });
    const warningList = el('ul', { class: 'mt-2 flex list-none flex-col gap-1 text-xs' });
    box.append(docList, entryPanel, summaryLine, warningList);

    const cancel = el('button', { class: `${BUTTON} ${CARD_BUTTON}`, text: '취소' });
    const submit = el('button', { class: `${PRIMARY} ${CARD_BUTTON} disabled:cursor-not-allowed disabled:opacity-50` });
    cancel.type = 'button';
    submit.type = 'button';
    box.append(el('div', { class: 'mt-3 flex justify-end gap-2' }, cancel, submit));

    const done = (value: CardDecision | null) => {
      box.remove();
      resolve(value);
    };
    cancel.addEventListener('click', () => done(null));
    submit.addEventListener('click', () => done(decisionOf(state)));

    // 상태가 바뀌면 계획·경고를 다시 그린다. 늦게 끝난 앞 계산은 버린다
    let sequence = 0;
    async function refresh(replan = false) {
      sequence += 1;
      const current = sequence;
      submit.disabled = true;
      const entryMode = state.mode === 'entry';
      docList.hidden = entryMode;
      entryPanel.hidden = !entryMode;
      if (replan) {
        const next = await recompute(state.excluded);
        if (current !== sequence) return;
        collection = next;
      }
      const labels = await sharedLabelsFor(choice, project, state, shares);
      if (current !== sequence) return;
      shared = labels;

      if (entryMode) {
        summaryLine.textContent = `폴더 안 파일 ${choice.pool.length}개를 모두 올려 문서 한 편을 만듭니다. 진입 파일: ${state.entry ?? ''}`;
        submit.textContent = '문서 하나로 올리기';
      } else {
        const shareText = collection.sharedAssets.length > 0 ? ` (함께 쓰는 자산 ${collection.sharedAssets.length}개)` : '';
        summaryLine.textContent = `문서 ${collection.docs.length}편 · 자산 ${collection.assets.length}개${shareText}`;
        submit.textContent = `문서 ${collection.docs.length}편 올리기`;
      }
      warningList.replaceChildren(
        ...cardWarnings({ choice, state, collection, legacy, shared, replaced }).map((text) =>
          el('li', { class: 'break-words rounded bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300', text }),
        ),
      );
      submit.disabled = !canSubmit(state, collection);
    }

    container.append(box);
    void refresh().then(() => submit.focus());
  });
}
