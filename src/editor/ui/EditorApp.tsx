// 에디터 페이지 루트 (재건 3단계 T3·T4·T6, Plan 4.4 데이터 흐름)
// - 열기: GET /api/admin/posts/{id} → editorJson 해시가 맞으면 JSON, 아니면 마크다운 파싱(D5).
// - 자동저장: 판단은 SaveController(state/save-controller.ts)가 한다. 이 컴포넌트는 화면 상태를 컨트롤러에 넘기고(snapshot),
//   입력·모드 전환·충돌 선택을 컨트롤러에 알린다. 표시는 autosave 리듀서 상태로 그린다.
// - 보기 모드 3종(D8): 편집(Tiptap) · 소스(textarea) · 미리보기(공유 파이프라인).
// - 발행·숨김·초안 버리기·삭제·로그아웃(D13).
// - 명령(D9): 레지스트리 하나(commands/registry.ts)에서 단축키·슬래시·팔레트(Mod+K)·툴바·모바일 툴바가 나온다.
//   에디터 범위 키는 Tiptap 키맵이, 페이지 범위 키(저장·발행·모드·패널·팔레트)는 창 keydown이 받는다.
//   사용자 키맵 덮어쓰기는 5단계다. 지금은 빈 객체다.
// - 개요·글자 수·읽기 시간(D13): 입력을 300ms 디바운스한 요약만 패널에 넘긴다.
// - 리렌더: Tiptap 상태는 에디터 안에만 있다. 이 컴포넌트는 저장 상태·메타·모드·요약이 바뀔 때만 다시 그린다.

import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { CommandPalette } from '@/editor/commands/CommandPalette';
import { readRecent, recordRecent, writeRecent } from '@/editor/commands/filter';
import { applyKeymapOverrides, detectPlatform } from '@/editor/commands/keymap';
import {
  createCommands,
  isCommandAvailable,
  type CommandActions,
  type EditorCommand,
  type MathTarget,
} from '@/editor/commands/registry';
import { createPageKeyHandler, createPageKeyListener } from '@/editor/commands/shortcuts';
import { docToMarkdown, markdownToDoc, type ConversionWarning } from '@/editor/markdown';
import { summarizeDoc, type DocSummary } from '@/editor/state/summary';
import {
  adminApi,
  ApiClientError,
  fieldIssuesOf,
  redirectToLogin,
  uploadTransport,
  type EntryResponse,
} from '@/editor/state/api';
import {
  autosaveReducer,
  describeSaveStatus,
  initialAutosaveState,
  type AutosaveEvent,
} from '@/editor/state/autosave';
import { resolveOpenDoc, type DraftMeta } from '@/editor/state/change';
import { readDeviceName, writeDeviceName } from '@/editor/state/device';
import {
  deleteOfflineDraft,
  getOfflineDraft,
  putOfflineDraft,
  type OfflineDraft,
} from '@/editor/state/offline-store';
import {
  conflictOf,
  messageOf,
  SaveController,
  type SaveBaseline,
  type SaveOutcome,
  type SaveSnapshot,
} from '@/editor/state/save-controller';
import { countUploadingNodes } from '@/editor/upload/paste-drop';
import { uploadAsset } from '@/editor/upload/upload-client';
import { safeUrl } from '@/lib/content/safe-url';
import { publicPathFor, type DraftInput } from '@/lib/entry-rules';
import type { EntryKind, EntryPublished, EntryStatus } from '@/lib/entry-schema';
import {
  ConflictDialog,
  DeleteDialog,
  DeviceDialog,
  LinkDialog,
  MathDialog,
  OfflineRestoreDialog,
  Toast,
  WarningsBanner,
  type ToastState,
} from './Dialogs';
import { createUiExtensions } from './editor-extensions';
import { MetaPanel } from './MetaPanel';
import { MobileBar } from './MobileBar';
import { PreviewMode } from './PreviewMode';
import { SourceMode } from './SourceMode';
import { Toolbar } from './Toolbar';
import { TopBar, type ViewMode } from './TopBar';

// 마지막 보기 모드를 기억하는 키 (D8)
const MODE_STORAGE_KEY = 'cruz-lab:editor-mode';
// 보기 모드 순환 순서(Mod+Shift+M, 부록 B)
const MODE_CYCLE: Record<ViewMode, ViewMode> = {
  edit: 'source',
  source: 'preview',
  preview: 'edit',
};
// 패널 요약 디바운스(D13)
const SUMMARY_DELAY_MS = 300;
// 이미지 고르기 창이 받는 형식(D11 2, asset-rules.ts와 같다)
const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,video/webm,video/mp4';
// 사용자 키맵 덮어쓰기. 저장과 설정 화면은 5단계다(D9)
const KEYMAP_OVERRIDES = {};

type ServerDraft = EntryResponse['draft'];

interface EntryInfo {
  kind: EntryKind;
  status: EntryStatus;
  published: EntryPublished | null;
  hasUnpublishedChanges: boolean;
}

type DialogState =
  | { kind: 'offline-restore'; offline: OfflineDraft }
  | { kind: 'delete' }
  | { kind: 'device' }
  | { kind: 'link'; href: string }
  | { kind: 'math'; target: MathTarget }
  | null;

// "지금 저장"이 끝나지 않았을 때의 안내
const SAVE_BLOCKED_MESSAGES: Partial<Record<SaveOutcome, string>> = {
  blocked: '저장을 끝내지 못했습니다. 업로드 중인 이미지가 있거나 입력이 이어지고 있습니다.',
  invalid: '입력 값을 고친 뒤 저장됩니다.',
  conflict: '다른 곳에서 먼저 저장했습니다. 충돌을 먼저 정리하세요.',
  offline: '오프라인입니다. 기기에 보관했고 연결되면 보냅니다.',
  failed: '저장이 실패했습니다. 상단의 다시 시도를 누르세요.',
  skipped: '입력이 끝난 뒤 저장됩니다.',
};

// 발행 전 저장이 끝나지 않았을 때의 안내 (리뷰 6.2 지적 5)
const PUBLISH_BLOCKED_MESSAGES: Partial<Record<SaveOutcome, string>> = {
  blocked: '업로드가 끝나지 않은 이미지가 있어 발행하지 않습니다. 업로드를 끝내거나 지우세요.',
  invalid: '입력 값을 고친 뒤 발행하세요.',
  conflict: '다른 곳에서 먼저 저장했습니다. 충돌을 먼저 정리하세요.',
  offline: '오프라인이라 저장되지 않았습니다. 연결된 뒤 발행하세요.',
  failed: '저장이 실패해 발행하지 않습니다. 저장 상태를 먼저 확인하세요.',
  skipped: '입력이 끝난 뒤 다시 누르세요.',
};

// 서버 초안에서 메타 부분만 꺼낸다
function pickMeta(draft: DraftInput): DraftMeta {
  return {
    title: draft.title,
    description: draft.description,
    slug: draft.slug,
    category: draft.category,
    tags: [...draft.tags],
    series: draft.series ? { ...draft.series } : null,
    cover: { ...draft.cover },
  };
}

function infoOf(data: EntryResponse): EntryInfo {
  return {
    kind: data.kind,
    status: data.status,
    published: data.published,
    hasUnpublishedChanges: data.hasUnpublishedChanges,
  };
}

// 문서를 에디터에 넣는다. 스키마와 맞지 않으면 false
function setContentSafely(
  editor: Editor,
  doc: Parameters<Editor['commands']['setContent']>[0],
): boolean {
  try {
    editor.commands.setContent(doc, { emitUpdate: false, errorOnInvalidContent: true });
    return true;
  } catch {
    return false;
  }
}

// 수식 창을 열 때의 노드가 아직 그 자리에 같은 내용으로 있는지
function isMathNodeAt(editor: Editor, target: MathTarget): boolean {
  if (target.pos === null) return false;
  const node = editor.state.doc.nodeAt(target.pos);
  const name = target.kind === 'block' ? 'blockMath' : 'inlineMath';
  return !!node && node.type.name === name && String(node.attrs.latex ?? '') === target.latex;
}

// 라이트·다크를 바꾼다. 사이트 헤더의 토글과 같은 저장 키('theme')를 쓴다(M10)
function toggleTheme() {
  const root = document.documentElement;
  const toLight = !root.classList.contains('light');
  root.classList.toggle('light', toLight);
  root.classList.toggle('dark', !toLight);
  localStorage.setItem('theme', toLight ? 'light' : 'dark');
}

function readStoredMode(): ViewMode {
  const value = localStorage.getItem(MODE_STORAGE_KEY);
  return value === 'source' || value === 'preview' ? value : 'edit';
}

// 빈 초안(열기 전 자리값)
function emptyDraft(): DraftInput {
  return {
    title: '',
    description: '',
    slug: '',
    category: null,
    tags: [],
    series: null,
    cover: { kind: 'generated' },
    markdown: '',
    editorJson: null,
  };
}

export default function EditorApp({ entryId }: { entryId: string }) {
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entry, setEntry] = useState<EntryInfo | null>(null);
  const [meta, setMeta] = useState<DraftMeta>(() => pickMeta(emptyDraft()));
  const [mode, setMode] = useState<ViewMode>('edit');
  const [sourceText, setSourceText] = useState('');
  const [previewMarkdown, setPreviewMarkdown] = useState('');
  const [warnings, setWarnings] = useState<ConversionWarning[]>([]);
  // 발행 422의 칸별 이유
  const [issues, setIssues] = useState<Record<string, string>>({});
  // 저장 전 검사(서버 규칙)의 칸별 이유
  const [saveIssues, setSaveIssues] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<ToastState | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth >= 1024);
  const [device, setDevice] = useState(() => readDeviceName(localStorage, navigator.userAgent));
  const [busy, setBusy] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [save, dispatch] = useReducer(autosaveReducer, 1, initialAutosaveState);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // 패널 요약(개요·글자 수·읽기 시간). 열기 전에는 null
  const [summary, setSummary] = useState<DocSummary | null>(null);
  const platform = useMemo(() => detectPlatform(navigator.platform), []);

  // 화면 상태의 거울. 컨트롤러의 snapshot과 이벤트 핸들러가 최신 값을 읽는다
  const editorRef = useRef<Editor | null>(null);
  const metaRef = useRef(meta);
  const modeRef = useRef(mode);
  const sourceRef = useRef(sourceText);
  const sourceDirtyRef = useRef(false);
  const deviceRef = useRef(device);
  const issuesRef = useRef(issues);
  const serverDraftRef = useRef<ServerDraft | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const summaryTimerRef = useRef<number | null>(null);
  deviceRef.current = device;
  issuesRef.current = issues;

  // ───────────── 명령 레지스트리 (D9) ─────────────

  // 화면 동작. 레지스트리는 한 번만 만들고, 동작은 이 ref로 최신 함수를 부른다
  const actionsRef = useRef<CommandActions | null>(null);
  const commands = useMemo(
    () =>
      applyKeymapOverrides(
        createCommands({
          pickImage: () => actionsRef.current?.pickImage(),
          editLink: () => actionsRef.current?.editLink(),
          editMath: (target) => actionsRef.current?.editMath(target),
          setMode: (mode) => actionsRef.current?.setMode(mode),
          cycleMode: () => actionsRef.current?.cycleMode(),
          saveNow: () => actionsRef.current?.saveNow(),
          publish: () => actionsRef.current?.publish(),
          togglePanel: () => actionsRef.current?.togglePanel(),
          openPalette: () => actionsRef.current?.openPalette(),
        }),
        KEYMAP_OVERRIDES,
      ),
    [],
  );
  const commandsRef = useRef<readonly EditorCommand[]>(commands);
  // 최근 사용 명령(슬래시·팔레트 정렬)
  const recentRef = useRef<string[]>(readRecent(localStorage));

  // 명령을 실행하고 최근 사용으로 기록한다(슬래시·팔레트·툴바·모바일 툴바가 같이 쓴다)
  const runCommand = useCallback((command: EditorCommand, target: Editor | null) => {
    recentRef.current = recordRecent(recentRef.current, command.id);
    writeRecent(localStorage, recentRef.current);
    command.run(target as Editor);
  }, []);

  // 패널 요약을 300ms 뒤에 한 번 만든다(키 입력마다 만들지 않는다, 2.2 #5)
  const scheduleSummary = useCallback((instance: Editor) => {
    if (summaryTimerRef.current !== null) window.clearTimeout(summaryTimerRef.current);
    summaryTimerRef.current = window.setTimeout(() => {
      summaryTimerRef.current = null;
      if (instance.isDestroyed) return;
      const doc = instance.getJSON();
      setSummary(summarizeDoc(doc, docToMarkdown(doc)));
    }, SUMMARY_DELAY_MS);
  }, []);
  useEffect(
    () => () => {
      if (summaryTimerRef.current !== null) window.clearTimeout(summaryTimerRef.current);
    },
    [],
  );

  const showToast = useCallback(
    (tone: ToastState['tone'], message: string, link?: ToastState['link']) => {
      setToast({ tone, message, link: link ?? null });
    },
    [],
  );
  const showToastRef = useRef(showToast);
  showToastRef.current = showToast;
  const closeToast = useCallback(() => setToast(null), []);

  // ───────────── 저장 컨트롤러 ─────────────

  // 지금 화면의 내용. 미리보기는 편집 문서를 그대로 쓴다
  const snapshot = useCallback((): SaveSnapshot => {
    const editor = editorRef.current;
    const blockers = editor ? countUploadingNodes(editor.state.doc) : 0;
    if (modeRef.current === 'source' || !editor) {
      return {
        mode: 'source',
        doc: null,
        markdown: sourceRef.current,
        meta: metaRef.current,
        blockers,
        composing: false,
      };
    }
    const doc = editor.getJSON();
    return {
      mode: 'edit',
      doc,
      markdown: docToMarkdown(doc),
      meta: metaRef.current,
      blockers,
      composing: editor.view.composing,
    };
  }, []);

  const controllerRef = useRef<SaveController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new SaveController(
      {
        entryId,
        snapshot: () => snapshot(),
        device: () => deviceRef.current,
        saveDraft: (body) => adminApi.saveDraft(entryId, body),
        putOffline: (offline) => putOfflineDraft(offline),
        deleteOffline: () => deleteOfflineDraft(entryId),
        dispatch: (event: AutosaveEvent) => {
          dispatch(event);
          // 발행본이 있는 글은 저장하면 "발행 뒤 변경 있음"이 된다(리뷰 6.2 지적 20)
          if (event.type === 'save-succeeded') {
            setEntry((current) =>
              current?.published && !current.hasUnpublishedChanges
                ? { ...current, hasUnpublishedChanges: true }
                : current,
            );
          }
        },
        onInvalid: (next) => setSaveIssues(next),
        onUnauthorized: () => redirectToLogin(),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (handle) => window.clearTimeout(handle as number),
        now: () => new Date().toISOString(),
      },
      1,
      { markdown: '', raw: '', meta: pickMeta(emptyDraft()) },
    );
  }
  const controller = controllerRef.current;

  useEffect(() => () => controller.dispose(), [controller]);

  // ───────────── 열기 ─────────────

  // 초안을 에디터와 메타에 넣는다. 그 상태의 비교 기준을 돌려준다
  const applyDraft = useCallback(
    async (
      editor: Editor,
      draft: DraftInput,
    ): Promise<{ baseline: SaveBaseline; warnings: ConversionWarning[] }> => {
      const nextMeta = pickMeta(draft);
      let opened = await resolveOpenDoc(draft);
      if (!setContentSafely(editor, opened.doc)) {
        // 저장된 편집 상태가 스키마와 맞지 않으면 마크다운에서 다시 만든다
        const fallback = markdownToDoc(draft.markdown);
        opened = { source: 'markdown', doc: fallback.doc, warnings: fallback.warnings };
        if (!setContentSafely(editor, opened.doc)) {
          throw new Error('본문을 에디터에 넣지 못했습니다. 소스를 확인하세요.');
        }
      }
      metaRef.current = nextMeta;
      setMeta(nextMeta);
      controller.setBlockers(countUploadingNodes(editor.state.doc));
      scheduleSummary(editor);
      return {
        baseline: {
          markdown: docToMarkdown(editor.getJSON()),
          raw: draft.markdown,
          meta: nextMeta,
        },
        warnings: opened.warnings,
      };
    },
    [controller, scheduleSummary],
  );

  // 열린 문서에 맞춰 소스·미리보기 텍스트를 다시 채운다
  const syncViewTexts = useCallback((editor: Editor, raw: string) => {
    if (modeRef.current === 'source') {
      sourceRef.current = raw;
      sourceDirtyRef.current = false;
      setSourceText(raw);
    }
    if (modeRef.current === 'preview') setPreviewMarkdown(docToMarkdown(editor.getJSON()));
  }, []);

  // 서버 문서를 통째로 받아 화면을 맞춘다(열기, 초안 버리기 뒤)
  const applyEntry = useCallback(
    async (editor: Editor, data: EntryResponse, options: { clearOffline?: boolean } = {}) => {
      serverDraftRef.current = data.draft;
      const opened = await applyDraft(editor, data.draft);
      controller.reset(data.draft.version, opened.baseline, options);
      setEntry(infoOf(data));
      setWarnings(opened.warnings);
      setIssues({});
      setSaveIssues({});
      syncViewTexts(editor, data.draft.markdown);
    },
    [applyDraft, controller, syncViewTexts],
  );

  // 발행·숨김 뒤 상태만 새로 읽는다(본문은 그대로)
  const refreshEntry = useCallback(async () => {
    const data = await adminApi.getEntry(entryId);
    serverDraftRef.current = data.draft;
    setEntry(infoOf(data));
  }, [entryId]);

  // ───────────── 에디터 ─────────────

  const handleUpdateRef = useRef<(editor: Editor) => void>(() => {});
  handleUpdateRef.current = (editor) => {
    controller.setBlockers(countUploadingNodes(editor.state.doc));
    controller.markChanged();
    scheduleSummary(editor);
    if (issuesRef.current.markdown) {
      // 본문을 고쳤으니 본문 칸의 발행 이유를 지운다
      setIssues((current) =>
        Object.fromEntries(Object.entries(current).filter(([key]) => key !== 'markdown')),
      );
    }
  };

  const editor = useEditor(
    {
      extensions: createUiExtensions({
        upload: {
          transport: uploadTransport,
          onReject: (message) => showToastRef.current('error', message),
        },
        getCommands: () => commandsRef.current,
        getRecent: () => recentRef.current,
        onSlashRun: (command, instance) => runCommand(command, instance),
        platform,
        onMathBlockRequest: () =>
          actionsRef.current?.editMath({ kind: 'block', pos: null, latex: '' }),
        onMathClick: (target) => actionsRef.current?.editMath(target),
      }),
      content: '',
      editorProps: {
        attributes: {
          class: 'tiptap-body prose focus:outline-none',
        },
      },
      onUpdate: ({ editor: instance }) => handleUpdateRef.current(instance),
    },
    [],
  );
  editorRef.current = editor;

  // 글을 연다
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    (async () => {
      try {
        const [data, offline] = await Promise.all([
          adminApi.getEntry(entryId),
          getOfflineDraft(entryId).catch(() => null),
        ]);
        if (cancelled) return;
        const storedMode = readStoredMode();
        await applyEntry(editor, data);
        if (storedMode !== 'edit') {
          modeRef.current = storedMode;
          setMode(storedMode);
          syncViewTexts(editor, controller.sourceTextFor(docToMarkdown(editor.getJSON())));
        }
        setPhase('ready');
        if (offline) setDialog({ kind: 'offline-restore', offline });
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiClientError && error.status === 404) {
          window.location.assign('/admin');
          return;
        }
        if (error instanceof ApiClientError && error.status === 401) {
          redirectToLogin();
          return;
        }
        setLoadError(messageOf(error));
        setPhase('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editor, entryId, applyEntry, controller, syncViewTexts]);

  // 온라인 복귀: 보관한 초안을 보낸다
  useEffect(() => {
    const onOnline = () => {
      if (controller.halt === 'offline') controller.resume('came-online');
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [controller]);

  // 저장되지 않은 변경이 있으면 떠나기 전에 묻는다
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.hasPending()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [controller]);

  // "방금 · 3분 전" 표시를 30초마다 새로 계산한다
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // 제목 칸 높이를 내용에 맞춘다(처음 열 때 포함, 리뷰 6.2 지적 22)
  useLayoutEffect(() => {
    const element = titleRef.current;
    if (!element) return;
    element.style.height = '0px';
    element.style.height = `${element.scrollHeight}px`;
  }, [meta.title, phase]);

  // ───────────── 메타·모드 ─────────────

  const updateMeta = useCallback(
    (patch: Partial<DraftMeta>) => {
      const next = { ...metaRef.current, ...patch };
      metaRef.current = next;
      setMeta(next);
      // 고친 칸의 발행 이유는 지운다
      const keys = Object.keys(patch);
      if (keys.some((key) => key in issuesRef.current)) {
        setIssues((current) =>
          Object.fromEntries(Object.entries(current).filter(([key]) => !keys.includes(key))),
        );
      }
      controller.markChanged();
    },
    [controller],
  );

  // 보기 모드를 바꾼다(D8). 소스 모드를 떠날 때 고친 글자가 있으면 다시 파싱한다
  const changeMode = useCallback(
    (next: ViewMode) => {
      const current = modeRef.current;
      if (!editor || next === current) return;

      // 업로드 중에는 소스 모드로 가지 않는다. 텍스트에 blob: 주소가 들어가기 때문이다(리뷰 6.2 지적 2)
      if (next === 'source' && countUploadingNodes(editor.state.doc) > 0) {
        showToast(
          'error',
          '업로드가 끝나지 않은 이미지가 있습니다. 업로드를 끝낸 뒤 소스 모드로 바꾸세요.',
        );
        return;
      }

      if (current === 'source') {
        const text = sourceRef.current;
        if (sourceDirtyRef.current) {
          const parsed = markdownToDoc(text);
          if (!setContentSafely(editor, parsed.doc)) {
            showToast('error', '소스를 문서로 바꾸지 못했습니다. 소스 모드에 머뭅니다.');
            return;
          }
          setWarnings(parsed.warnings);
          controller.setBlockers(countUploadingNodes(editor.state.doc));
          scheduleSummary(editor);
        }
        sourceDirtyRef.current = false;
        // 모드를 먼저 바꿔야 컨트롤러가 편집 모드로 비교한다
        modeRef.current = next;
        void controller.sourceExited(text, docToMarkdown(editor.getJSON()));
      }

      if (next === 'source') {
        const text = controller.sourceTextFor(docToMarkdown(editor.getJSON()));
        sourceRef.current = text;
        sourceDirtyRef.current = false;
        setSourceText(text);
      }
      if (next === 'preview') setPreviewMarkdown(docToMarkdown(editor.getJSON()));

      modeRef.current = next;
      setMode(next);
      localStorage.setItem(MODE_STORAGE_KEY, next);
    },
    [controller, editor, scheduleSummary, showToast],
  );

  const changeSource = useCallback(
    (text: string) => {
      sourceRef.current = text;
      sourceDirtyRef.current = true;
      setSourceText(text);
      controller.markChanged();
      // 소스에서 제목을 고치면 개요·글자 수도 따라간다(리뷰 6.3 경미 8)
      if (summaryTimerRef.current !== null) window.clearTimeout(summaryTimerRef.current);
      summaryTimerRef.current = window.setTimeout(() => {
        summaryTimerRef.current = null;
        setSummary(summarizeDoc(markdownToDoc(text).doc, text));
      }, SUMMARY_DELAY_MS);
    },
    [controller],
  );

  // ───────────── 충돌·보관함 ─────────────

  const localMarkdown = useCallback(() => {
    if (modeRef.current === 'source') return sourceRef.current;
    const instance = editorRef.current;
    return instance ? docToMarkdown(instance.getJSON()) : '';
  }, []);

  // "서버 것 열기": 서버 초안을 그대로 연다. 내 변경은 버린다(복사 버튼으로 먼저 옮길 수 있다)
  const takeServer = useCallback(async () => {
    const conflict = save.conflict;
    if (!editor || !conflict) return;
    const serverDraft = conflict.draft ?? serverDraftRef.current;
    if (!serverDraft) return;
    serverDraftRef.current = serverDraft;
    try {
      const opened = await applyDraft(editor, serverDraft);
      controller.takeServer(conflict.version, opened.baseline);
      setWarnings(opened.warnings);
      setSaveIssues({});
      syncViewTexts(editor, serverDraft.markdown);
    } catch (error) {
      showToast('error', messageOf(error));
    }
  }, [applyDraft, controller, editor, save.conflict, showToast, syncViewTexts]);

  // "내 것으로 덮기": 서버 버전을 받아 지금 내용을 비교 없이 보낸다
  const keepLocal = useCallback(() => {
    const conflict = save.conflict;
    if (conflict) controller.keepLocal(conflict.version);
  }, [controller, save.conflict]);

  // 보관한 초안 이어 쓰기. 서버 버전이 그대로면 바로 보내고, 달라졌으면 충돌 화면이다
  const restoreOffline = useCallback(
    async (offline: OfflineDraft) => {
      setDialog(null);
      if (!editor) return;
      try {
        await applyDraft(editor, offline.draft);
      } catch (error) {
        showToast('error', messageOf(error));
        return;
      }
      if (modeRef.current === 'source') {
        sourceRef.current = offline.draft.markdown;
        sourceDirtyRef.current = true;
        setSourceText(offline.draft.markdown);
      }
      if (modeRef.current === 'preview') setPreviewMarkdown(docToMarkdown(editor.getJSON()));
      if (offline.baseVersion === controller.version) {
        controller.markChanged();
        return;
      }
      const server = serverDraftRef.current;
      controller.enterConflict({
        version: controller.version,
        device: server?.device ?? null,
        updatedAt: server?.updatedAt ?? null,
        draft: server,
      });
    },
    [applyDraft, controller, editor, showToast],
  );

  const discardOffline = useCallback(() => {
    setDialog(null);
    void deleteOfflineDraft(entryId).catch(() => {});
  }, [entryId]);

  // ───────────── 발행·숨김·버리기·삭제 ─────────────

  // 발행이 도는 동안 다시 들어오지 않는다(키·팔레트는 버튼처럼 막히지 않는다, 리뷰 6.3 중요 1)
  const publishingRef = useRef(false);
  const publish = useCallback(async () => {
    if (!entry || publishingRef.current) return;
    publishingRef.current = true;
    setBusy('publish');
    try {
      // 저장이 끝나지 않으면 발행하지 않는다(리뷰 6.2 지적 5)
      const outcome = await controller.flush();
      if (outcome !== 'saved' && outcome !== 'unchanged') {
        showToast('error', PUBLISH_BLOCKED_MESSAGES[outcome] ?? '저장되지 않아 발행하지 않습니다.');
        return;
      }
      const result = await adminApi.publish(entryId, controller.version);
      setIssues({});
      const notes = [
        result.purge === 'failed' ? '캐시 비우기 실패' : '',
        result.backup === 'failed' ? '백업 알림 실패' : '',
      ].filter(Boolean);
      const suffix = notes.length > 0 ? ` · ${notes.join(' · ')}` : '';
      if (result.publicUrl) {
        showToast('success', `발행됨${suffix}`, {
          href: result.publicUrl,
          label: '공개 페이지 보기',
        });
      } else {
        // 공개 주소가 없는 글(연재가 없는 project 글. 발행 검사가 막으므로 보통은 오지 않는다)
        showToast('success', `발행됨 · 공개 주소가 없습니다${suffix}`);
      }
      await refreshEntry();
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 422) {
        const fieldIssues = fieldIssuesOf(error);
        setIssues(fieldIssues);
        setPanelOpen(true);
        showToast(
          'error',
          fieldIssues.markdown
            ? `발행 조건: ${fieldIssues.markdown}`
            : '발행 조건을 지키지 않았습니다. 표시된 칸을 확인하세요.',
        );
      } else if (error instanceof ApiClientError && error.status === 409) {
        controller.enterConflict(conflictOf(error));
      } else {
        showToast('error', `발행 실패 · ${messageOf(error)}`);
      }
    } finally {
      publishingRef.current = false;
      setBusy(null);
    }
  }, [controller, entry, entryId, refreshEntry, showToast]);

  const toggleVisibility = useCallback(async () => {
    if (!entry) return;
    setBusy('visibility');
    try {
      const result = await adminApi.setVisibility(entryId, entry.status === 'hidden');
      setEntry({ ...entry, status: result.status });
      showToast(
        'success',
        result.status === 'hidden' ? '숨겼습니다. 공개 페이지는 404입니다.' : '다시 보입니다.',
      );
    } catch (error) {
      showToast('error', messageOf(error));
    } finally {
      setBusy(null);
    }
  }, [entry, entryId, showToast]);

  const discardDraft = useCallback(async () => {
    if (!editor || !entry?.published) return;
    if (!window.confirm('초안을 버리고 발행본으로 되돌립니다. 저장하지 않은 변경도 사라집니다.')) {
      return;
    }
    setBusy('discard');
    try {
      controller.dispose();
      await controller.idle();
      await adminApi.discardDraft(entryId, controller.version);
      const data = await adminApi.getEntry(entryId);
      // 버린 내용이 보관함에서 다시 나오지 않게 지운다(리뷰 6.2 지적 16)
      await applyEntry(editor, data, { clearOffline: true });
      showToast('success', '초안을 발행본으로 되돌렸습니다.');
    } catch (error) {
      if (
        error instanceof ApiClientError &&
        error.status === 409 &&
        error.code === 'DRAFT_CONFLICT'
      ) {
        controller.enterConflict(conflictOf(error));
      } else {
        showToast('error', messageOf(error));
      }
    } finally {
      setBusy(null);
    }
  }, [applyEntry, controller, editor, entry?.published, entryId, showToast]);

  const deleteEntry = useCallback(async () => {
    setBusy('delete');
    try {
      await adminApi.deleteEntry(entryId);
      controller.leave();
      await deleteOfflineDraft(entryId).catch(() => {});
      window.location.assign('/admin');
    } catch (error) {
      showToast('error', messageOf(error));
      setBusy(null);
    }
  }, [controller, entryId, showToast]);

  const logout = useCallback(async () => {
    try {
      await adminApi.logout();
    } finally {
      controller.leave();
      window.location.assign('/admin/login');
    }
  }, [controller]);

  // 표지 이미지를 올린다(D11 1 "표지 선택")
  const uploadCover = useCallback(
    async (file: File) => {
      setCoverUploading(true);
      try {
        const { asset } = await uploadAsset(file, uploadTransport, () => {});
        updateMeta({ cover: { kind: 'image', url: asset.url, assetId: asset.id } });
      } catch (error) {
        showToast('error', `표지 업로드 실패 · ${messageOf(error)}`);
      } finally {
        setCoverUploading(false);
      }
    },
    [showToast, updateMeta],
  );

  // ───────────── 명령의 화면 동작 (T5) ─────────────

  // "지금 저장"(Mod+S). 보내지 못했으면 이유를 알린다. 저장됨 표시는 상단 바가 한다
  const saveNow = useCallback(async () => {
    const outcome = await controller.flush();
    if (outcome !== 'saved' && outcome !== 'unchanged') {
      showToast('info', SAVE_BLOCKED_MESSAGES[outcome] ?? '저장하지 못했습니다.');
    }
  }, [controller, showToast]);

  // 링크 창을 연다. 커서가 링크 안이면 그 주소를 보인다
  const openLinkDialog = useCallback(() => {
    if (!editor || modeRef.current !== 'edit') return;
    const href = editor.getAttributes('link').href;
    setDialog({ kind: 'link', href: typeof href === 'string' ? href : '' });
  }, [editor]);

  // 링크 저장: 빈 주소면 링크를 풀고, 선택이 없으면 주소 글자를 링크로 넣는다
  const saveLink = useCallback(
    (href: string) => {
      setDialog(null);
      if (!editor) return;
      const chain = editor.chain().focus().extendMarkRange('link');
      if (!href) {
        chain.unsetLink().run();
        return;
      }
      // 넣기 경로는 Link 확장의 주소 검사를 거치지 않으므로 먼저 거른다(리뷰 6.3 경미 5)
      if (safeUrl(href) !== href) {
        showToast('error', '허용하지 않는 주소입니다. http·https·mailto 주소를 쓰세요.');
        return;
      }
      const ok =
        editor.state.selection.empty && !editor.isActive('link')
          ? editor
              .chain()
              .focus()
              .insertContent({
                type: 'text',
                text: href,
                marks: [{ type: 'link', attrs: { href } }],
              })
              .run()
          : chain.setLink({ href }).run();
      if (!ok) showToast('error', '허용하지 않는 주소입니다. http·https·mailto 주소를 쓰세요.');
    },
    [editor, showToast],
  );

  // 수식 창을 연다(새로 넣기 또는 기존 노드 고치기)
  const openMathDialog = useCallback((target: MathTarget) => {
    if (modeRef.current !== 'edit') return;
    setDialog({ kind: 'math', target });
  }, []);

  // 수식 저장: pos가 있으면 그 노드를 고치고, 없으면 지금 자리에 넣는다.
  // 인라인 수식은 한 줄이어야 한다(마크다운 $…$ 안의 줄바꿈은 수식을 끊는다). 줄바꿈을 공백으로 바꾼다
  const saveMath = useCallback(
    (target: MathTarget, input: string) => {
      setDialog(null);
      const latex = target.kind === 'inline' ? input.replace(/\s*\n\s*/g, ' ').trim() : input;
      if (!editor || !latex) return;
      const chain = editor.chain().focus();
      if (target.pos !== null) {
        // 창이 열린 동안 문서가 바뀌었으면(충돌 창, 되돌리기) 다른 노드를 고치지 않는다(리뷰 6.3 경미 7)
        if (!isMathNodeAt(editor, target)) {
          showToast('error', '수식 자리가 바뀌어 저장하지 않았습니다. 수식을 다시 눌러 고치세요.');
          return;
        }
        if (target.kind === 'block') chain.updateBlockMath({ pos: target.pos, latex }).run();
        else chain.updateInlineMath({ pos: target.pos, latex }).run();
        return;
      }
      if (target.kind === 'block') {
        chain.insertContent({ type: 'blockMath', attrs: { latex } }).run();
      } else {
        chain.insertInlineMath({ latex }).run();
      }
    },
    [editor, showToast],
  );

  // 수식 삭제(고치는 창에서만)
  const deleteMath = useCallback(
    (target: MathTarget) => {
      setDialog(null);
      if (!editor || target.pos === null) return;
      if (!isMathNodeAt(editor, target)) return;
      const chain = editor.chain().focus();
      if (target.kind === 'block') chain.deleteBlockMath({ pos: target.pos }).run();
      else chain.deleteInlineMath({ pos: target.pos }).run();
    },
    [editor],
  );

  // 이미지 고르기 창을 연다(/이미지, Mod+Shift+I, 툴바)
  const pickImage = useCallback(() => {
    if (modeRef.current !== 'edit') return;
    imageInputRef.current?.click();
  }, []);

  // 개요에서 누른 제목(문서 안 순번)으로 간다
  const jumpToHeading = useCallback(
    (index: number) => {
      if (!editor) return;
      if (modeRef.current !== 'edit') changeMode('edit');
      let seen = -1;
      let target: number | null = null;
      editor.state.doc.descendants((node, pos) => {
        if (target !== null) return false;
        if (node.type.name === 'heading') {
          seen += 1;
          if (seen === index) target = pos;
        }
        return true;
      });
      if (target === null) return;
      const position = target;
      // 모드를 바꾼 경우 편집 영역이 보인 뒤에 옮긴다
      window.setTimeout(() => {
        editor
          .chain()
          .focus()
          .setTextSelection(position + 1)
          .scrollIntoView()
          .run();
        // 좁은 화면에서는 시트를 닫아 본문이 보이게 한다
        if (window.innerWidth < 1024) setPanelOpen(false);
      }, 0);
    },
    [changeMode, editor],
  );

  // 레지스트리의 화면 동작을 최신 함수로 잇는다
  actionsRef.current = {
    pickImage,
    editLink: openLinkDialog,
    editMath: openMathDialog,
    setMode: changeMode,
    cycleMode: () => changeMode(MODE_CYCLE[modeRef.current]),
    saveNow: () => void saveNow(),
    publish: () => void publish(),
    togglePanel: () => setPanelOpen((open) => !open),
    openPalette: () => setPaletteOpen((open) => !open),
  };

  // 페이지 범위 키(저장·발행·모드·패널·팔레트). 소스·미리보기 모드와 제목 칸에서도 돈다
  useEffect(() => {
    const onKeyDown = createPageKeyListener(
      createPageKeyHandler(commands, platform, () => editorRef.current),
    );
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commands, platform]);

  // 팔레트에 보이는 명령: 편집 모드면 그 자리에서 쓸 수 있는 것, 아니면 페이지 범위만
  const paletteCommands = useMemo(() => {
    if (!paletteOpen) return [];
    return commands.filter(
      (command) =>
        command.inPalette &&
        (command.scope === 'page' ||
          (mode === 'edit' && editor !== null && isCommandAvailable(command, editor))),
    );
  }, [commands, editor, mode, paletteOpen]);

  // ───────────── 화면 ─────────────

  if (phase === 'error') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-text-secondary">
        <p>글을 열지 못했습니다. {loadError}</p>
        <a href="/admin" className="text-brand">
          목록으로
        </a>
      </div>
    );
  }

  const statusText = describeSaveStatus(save, { device, now });
  const statusTone =
    save.status === 'error'
      ? 'error'
      : save.status === 'offline' || save.status === 'conflict'
        ? 'warn'
        : 'muted';
  const publicUrl =
    entry?.published && entry.status === 'published'
      ? (() => {
          const path = publicPathFor(entry.kind, entry.published.slug, entry.published.series);
          return path ? new URL(path, window.location.origin).toString() : null;
        })()
      : null;
  const shownIssues = { ...issues, ...saveIssues };

  return (
    <div
      className={`flex h-screen flex-col bg-bg-app text-text-primary ${phase === 'loading' ? 'pointer-events-none opacity-60' : ''}`}
    >
      <TopBar
        statusText={phase === 'loading' ? '불러오는 중…' : statusText}
        statusTone={statusTone}
        onRetrySave={
          save.status === 'error' || save.status === 'offline'
            ? () => controller.resume('retry')
            : null
        }
        entryStatus={entry?.status ?? 'draft'}
        mode={mode}
        onModeChange={changeMode}
        onPublish={publish}
        publishing={busy === 'publish'}
        publicUrl={publicUrl}
        onToggleVisibility={entry?.published ? toggleVisibility : null}
        onDiscardDraft={entry?.published ? discardDraft : null}
        onDelete={() => setDialog({ kind: 'delete' })}
        onDeviceName={() => setDialog({ kind: 'device' })}
        onToggleTheme={toggleTheme}
        onLogout={logout}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((open) => !open)}
        onOpenPalette={() => setPaletteOpen(true)}
      />
      {editor && mode === 'edit' && (
        <Toolbar
          editor={editor}
          commands={commands}
          platform={platform}
          onRun={(command) => runCommand(command, editor)}
        />
      )}

      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-8">
            <textarea
              ref={titleRef}
              className="placeholder:text-text-secondary/50 mb-2 w-full resize-none bg-transparent text-3xl font-extrabold leading-tight text-text-primary focus:outline-none"
              rows={1}
              value={meta.title}
              placeholder={entry?.kind === 'note' ? '제목 (선택)' : '제목'}
              onChange={(event) => updateMeta({ title: event.target.value })}
              aria-label="제목"
            />
            {shownIssues.title && (
              <p className="mb-3 text-xs text-red-400" role="alert">
                {shownIssues.title}
              </p>
            )}

            <WarningsBanner warnings={warnings} onClose={() => setWarnings([])} />
            {shownIssues.markdown && (
              <p className="mb-3 text-xs text-red-400" role="alert">
                {shownIssues.markdown}
              </p>
            )}

            <div className={mode === 'edit' ? '' : 'hidden'}>
              <EditorContent editor={editor} />
            </div>
            {mode === 'source' && <SourceMode value={sourceText} onChange={changeSource} />}
            {mode === 'preview' && <PreviewMode markdown={previewMarkdown} />}
          </div>
        </main>

        {entry && (
          <MetaPanel
            open={panelOpen}
            onClose={() => setPanelOpen(false)}
            kind={entry.kind}
            status={entry.status}
            hasUnpublishedChanges={entry.hasUnpublishedChanges}
            meta={meta}
            onChange={updateMeta}
            issues={shownIssues}
            coverUploading={coverUploading}
            onCoverFile={uploadCover}
            summary={summary}
            onJumpToHeading={jumpToHeading}
            onPublish={publish}
            publishing={busy === 'publish'}
          />
        )}
      </div>

      {editor && mode === 'edit' && (
        <MobileBar
          editor={editor}
          commands={commands}
          onRun={(command) => runCommand(command, editor)}
        />
      )}
      <input
        ref={imageInputRef}
        type="file"
        multiple
        accept={IMAGE_ACCEPT}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = '';
          if (editor && files.length > 0) editor.chain().focus().insertImageFiles(files).run();
        }}
      />
      {paletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          recent={recentRef.current}
          platform={platform}
          onRun={(command) => runCommand(command, editorRef.current)}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {dialog?.kind === 'link' && (
        <LinkDialog
          initialHref={dialog.href}
          onSave={saveLink}
          onCancel={() => {
            setDialog(null);
            editor?.commands.focus();
          }}
        />
      )}
      {dialog?.kind === 'math' && (
        <MathDialog
          kind={dialog.target.kind}
          initialLatex={dialog.target.latex}
          canDelete={dialog.target.pos !== null}
          onSave={(latex) => saveMath(dialog.target, latex)}
          onDelete={() => deleteMath(dialog.target)}
          onCancel={() => {
            setDialog(null);
            editor?.commands.focus();
          }}
        />
      )}

      {save.status === 'conflict' && save.conflict && (
        <ConflictDialog
          conflict={save.conflict}
          localMarkdown={localMarkdown}
          onTakeServer={takeServer}
          onKeepLocal={keepLocal}
        />
      )}
      {dialog?.kind === 'offline-restore' && (
        <OfflineRestoreDialog
          savedAt={dialog.offline.savedAt}
          onRestore={() => restoreOffline(dialog.offline)}
          onDiscard={discardOffline}
        />
      )}
      {dialog?.kind === 'delete' && (
        <DeleteDialog
          title={meta.title}
          busy={busy === 'delete'}
          onCancel={() => setDialog(null)}
          onConfirm={deleteEntry}
        />
      )}
      {dialog?.kind === 'device' && (
        <DeviceDialog
          value={device}
          onCancel={() => setDialog(null)}
          onSave={(name) => {
            setDevice(writeDeviceName(localStorage, name));
            setDialog(null);
          }}
        />
      )}
      {toast && <Toast toast={toast} onClose={closeToast} />}
    </div>
  );
}
