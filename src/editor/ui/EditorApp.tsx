// 에디터 페이지 루트 (재건 3단계 T3·T4·T6, Plan 4.4 데이터 흐름)
// - 열기: GET /api/admin/posts/{id} → editorJson 해시가 맞으면 JSON, 아니면 마크다운 파싱(D5).
// - 자동저장: 판단은 SaveController(state/save-controller.ts)가 한다. 이 컴포넌트는 화면 상태를 컨트롤러에 넘기고(snapshot),
//   입력·모드 전환·충돌 선택을 컨트롤러에 알린다. 표시는 autosave 리듀서 상태로 그린다.
// - 보기 모드 3종(D8): 편집(Tiptap) · 소스(textarea) · 미리보기(공유 파이프라인).
// - 발행·숨김·초안 버리기·삭제·로그아웃(D13). 명령 레지스트리·단축키·모바일 툴바·개요는 PR-C(T5)가 더한다.
// - 리렌더: Tiptap 상태는 에디터 안에만 있다. 이 컴포넌트는 저장 상태·메타·모드가 바뀔 때만 다시 그린다.

import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { docToMarkdown, markdownToDoc, type ConversionWarning } from '@/editor/markdown';
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
import { publicPathFor, type DraftInput } from '@/lib/entry-rules';
import type { EntryKind, EntryPublished, EntryStatus } from '@/lib/entry-schema';
import {
  ConflictDialog,
  DeleteDialog,
  DeviceDialog,
  OfflineRestoreDialog,
  Toast,
  WarningsBanner,
  type ToastState,
} from './Dialogs';
import { createUiExtensions } from './editor-extensions';
import { MetaPanel } from './MetaPanel';
import { PreviewMode } from './PreviewMode';
import { SourceMode } from './SourceMode';
import { TopBar, type ViewMode } from './TopBar';

// 마지막 보기 모드를 기억하는 키 (D8)
const MODE_STORAGE_KEY = 'cruz-lab:editor-mode';

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
  | null;

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
  deviceRef.current = device;
  issuesRef.current = issues;

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
      return {
        baseline: {
          markdown: docToMarkdown(editor.getJSON()),
          raw: draft.markdown,
          meta: nextMeta,
        },
        warnings: opened.warnings,
      };
    },
    [controller],
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
        transport: uploadTransport,
        onReject: (message) => showToastRef.current('error', message),
      }),
      content: '',
      editorProps: {
        attributes: {
          class: 'tiptap-body prose prose-lg max-w-none focus:outline-none dark:prose-invert',
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
    [controller, editor, showToast],
  );

  const changeSource = useCallback(
    (text: string) => {
      sourceRef.current = text;
      sourceDirtyRef.current = true;
      setSourceText(text);
      controller.markChanged();
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

  const publish = useCallback(async () => {
    if (!entry) return;
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
        showToast('success', `발행됨 · 노트는 아직 공개 주소가 없습니다(4단계)${suffix}`);
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
          const path = publicPathFor(entry.kind, entry.published.slug);
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
      />

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
          />
        )}
      </div>

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
