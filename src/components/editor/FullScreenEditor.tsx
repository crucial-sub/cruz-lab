/**
 * 풀스크린 에디터 컴포넌트
 *
 * CodeMirror 6 기반 마크다운 에디터입니다.
 * - Markdown 기반 출간 경로 사용
 * - 임시저장은 localStorage에 저장
 * - GitHub 자산 업로드 통합
 */
import { Suspense, lazy, useState, useEffect, useCallback, useRef } from 'react';
import {
  createLocalDraftKey,
  hasDraftContent,
  LEGACY_NEW_DRAFT_KEY,
  removeEditorDraft,
  saveEditorDraft,
  type EditorDraftPayload,
} from '@/lib/editor-drafts';
import {
  generateMarkdownContent,
  generateMarkdownFileName,
  parseMarkdownDocument,
} from '@/lib/markdown-publish';
import type { PublishFeedback } from '@/lib/publish-feedback';
import { EditorMetaPanel } from './EditorMetaPanel';

const CodeMirrorEditor = lazy(() => import('./CodeMirrorEditor'));
const PublishModal = lazy(() => import('./PublishModal'));

interface Props {
  mode: 'create' | 'edit';
  postId?: string;
}

function EditorSurfaceFallback() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-gray-100 bg-gray-50">
      <div className="flex flex-col items-center gap-3 text-gray-400">
        <div className="h-7 w-7 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        <p className="text-sm">에디터 준비 중...</p>
      </div>
    </div>
  );
}

function PublishModalFallback() {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
      <div className="flex min-h-full items-center justify-center">
        <div className="flex w-full max-w-xl items-center justify-center rounded-2xl bg-white p-10">
          <div className="flex flex-col items-center gap-3 text-gray-500">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
            <p className="text-sm">출간 설정 불러오는 중...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FullScreenEditor({ mode, postId: initialPostId }: Props) {
  const createEphemeralDraftKey = useCallback(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return createLocalDraftKey(crypto.randomUUID());
    }

    return createLocalDraftKey(`${Date.now()}-${Math.random().toString(16).slice(2)}`);
  }, []);

  const getDraftKey = useCallback((targetSlug?: string) => {
    if (targetSlug) return `cruz-lab-editor-draft:${targetSlug}`;
    return LEGACY_NEW_DRAFT_KEY;
  }, []);

  // 상태
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasUserChanges, setHasUserChanges] = useState(false);
  const [activeDraftKey, setActiveDraftKey] = useState<string | null>(null);

  // 출간 설정 상태 (편집 시 기존 값 유지)
  const [heroImage, setHeroImage] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [originalSlug, setOriginalSlug] = useState('');
  const [originalPubDate, setOriginalPubDate] = useState<string>('');
  const importInputRef = useRef<HTMLInputElement>(null);

  // 에디터 마운트 키 (defaultValue 변경 시 에디터 재생성용)
  const [editorKey, setEditorKey] = useState(0);
  const autosaveTimerRef = useRef<number | null>(null);
  const manualSaveNoticeTimerRef = useRef<number | null>(null);
  const lastPersistedDraftKeyRef = useRef<string | null>(null);
  const activeCreateDraftKeyRef = useRef<string | null>(null);
  const [manualSaveNotice, setManualSaveNotice] = useState<'saved' | 'error' | null>(null);

  const markDirty = useCallback(() => {
    setHasUserChanges(true);
  }, []);

  const resetEditorState = useCallback(() => {
    setTitle('');
    setContent('');
    setTags([]);
    setTagInput('');
    setHeroImage('');
    setDescription('');
    setSlug('');
    setIsPublic(true);
    setOriginalSlug('');
    setOriginalPubDate('');
    setLastSavedAt(null);
    setAutosaveState('idle');
    setHasUserChanges(false);
    setEditorKey((prev) => prev + 1);
  }, []);

  const deriveSlug = useCallback((value: string) => {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9가-힣\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 50);
  }, []);

  // Firebase 초기화 및 데이터 로드
  useEffect(() => {
    if (mode === 'edit') {
      const urlParams = new URLSearchParams(window.location.search);
      const targetSlug = urlParams.get('slug');

      if (targetSlug) {
        loadMarkdownPost(targetSlug);
        return;
      }

      if (!initialPostId) {
        setLoadError('포스트 slug가 없습니다.');
        setIsLoading(false);
        return;
      }

      loadMarkdownPost(initialPostId);
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const explicitDraftKey = urlParams.get('draft');

    if (explicitDraftKey?.startsWith('cruz-lab-editor-draft:')) {
      activeCreateDraftKeyRef.current = explicitDraftKey;
      setActiveDraftKey(explicitDraftKey);
      tryLoadDraft(undefined, explicitDraftKey);
      return;
    }

    if (window.localStorage.getItem(LEGACY_NEW_DRAFT_KEY)) {
      activeCreateDraftKeyRef.current = LEGACY_NEW_DRAFT_KEY;
      setActiveDraftKey(LEGACY_NEW_DRAFT_KEY);
      tryLoadDraft(undefined, LEGACY_NEW_DRAFT_KEY);
      return;
    }

    activeCreateDraftKeyRef.current = createEphemeralDraftKey();
    setActiveDraftKey(null);
    setHasUserChanges(false);
  }, [createEphemeralDraftKey, initialPostId, mode]);

  const tryLoadDraft = useCallback((targetSlug?: string, explicitDraftKey?: string) => {
    if (typeof window === 'undefined') return;

    const draftKey = explicitDraftKey || getDraftKey(targetSlug);
    const raw = window.localStorage.getItem(draftKey);
    if (!raw) return;

    try {
      const draft = JSON.parse(raw);
      lastPersistedDraftKeyRef.current = draftKey;
      setActiveDraftKey(draftKey);
      setTitle(draft.title || '');
      setContent(draft.content || '');
      setTags(draft.tags || []);
      setHeroImage(draft.heroImage || '');
      setDescription(draft.description || '');
      setSlug(draft.slug || targetSlug || '');
      setIsPublic(draft.isPublic ?? true);
      setLastSavedAt(draft.updatedDate ? new Date(draft.updatedDate) : null);
      setAutosaveState(draft.updatedDate ? 'saved' : 'idle');
      setHasUserChanges(false);
      setEditorKey((prev) => prev + 1);
    } catch (error) {
      console.error('임시저장 불러오기 오류:', error);
    }
  }, [getDraftKey]);

  const loadMarkdownPost = async (targetSlug: string) => {
    try {
      setActiveDraftKey(null);
      lastPersistedDraftKeyRef.current = null;
      const response = await fetch(`/api/posts/by-slug?slug=${encodeURIComponent(targetSlug)}`);
      if (!response.ok) {
        setLoadError('포스트를 찾을 수 없습니다.');
        return;
      }

      const data = await response.json();
      setTitle(data.title || '');
      setContent(data.content || '');
      setTags(data.tags || []);
      setHeroImage(data.heroImage || '');
      setDescription(data.description || '');
      setSlug(data.slug || targetSlug);
      setIsPublic(data.isPublic ?? true);
      setOriginalSlug(data.slug || targetSlug);
      setOriginalPubDate(data.pubDate || '');
      setHasUserChanges(false);
      setEditorKey((prev) => prev + 1);
      tryLoadDraft(targetSlug, getDraftKey(targetSlug));
    } catch (err) {
      console.error('포스트 로딩 오류:', err);
      setLoadError('포스트를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 레거시 Firestore 문서 로드
  // 마크다운 변경 핸들러
  const handleContentChange = useCallback((markdown: string) => {
    setHasUserChanges(true);
    setContent(markdown);
  }, []);

  // 이미지 업로드 에러 핸들러
  const handleUploadError = useCallback((error: Error) => {
    console.error('이미지 업로드 오류:', error);
    alert(`이미지 업로드 실패: ${error.message}`);
  }, []);

  const handleImportMarkdown = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const hasExistingDraft = title.trim() || content.trim() || tags.length > 0 || description.trim();
    if (hasExistingDraft && !window.confirm('현재 작성 중인 내용을 가져온 markdown으로 덮어쓸까요?')) {
      event.target.value = '';
      return;
    }

    try {
      const raw = await file.text();
      const parsed = parseMarkdownDocument(raw, file.name);

      setTitle(parsed.title || '');
      setDescription(parsed.description || '');
      setContent(parsed.content || '');
      setTags(parsed.tags || []);
      setHeroImage(parsed.heroImage || '');
      setSlug(parsed.slug || '');
      setIsPublic(parsed.isPublic ?? true);
      setOriginalPubDate(parsed.pubDate || (mode === 'edit' ? originalPubDate : ''));

      if (mode === 'edit') {
        setOriginalSlug(parsed.slug || originalSlug);
      } else {
        setOriginalSlug('');
      }

      setHasUserChanges(true);
      setEditorKey((prev) => prev + 1);
    } catch (error) {
      console.error('마크다운 파일 불러오기 오류:', error);
      alert(error instanceof Error ? error.message : '마크다운 파일을 불러오지 못했습니다.');
    } finally {
      event.target.value = '';
    }
  }, [content, description, mode, originalPubDate, originalSlug, tags.length, title]);

  // 태그 추가 (한글 IME 이슈 수정)
  const handleAddTag = () => {
    if (isComposing) return; // 한글 조합 중이면 무시

    const newTag = tagInput.trim();
    if (newTag && !tags.includes(newTag)) {
      setHasUserChanges(true);
      setTags([...tags, newTag]);
    }
    setTagInput('');
  };

  // 태그 입력 키 이벤트
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!isComposing) {
        handleAddTag();
      }
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setHasUserChanges(true);
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  // 읽기 시간 계산
  const calculateReadingTime = (text: string): number => {
    const wordsPerMinute = 200;
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute);
  };

  const buildDraftData = useCallback((): EditorDraftPayload => ({
    title,
    description,
    content,
    tags,
    slug,
    heroImage,
    isPublic,
    updatedDate: new Date().toISOString(),
    readingTime: calculateReadingTime(content),
  }), [title, description, content, tags, slug, heroImage, isPublic]);

  const persistDraft = useCallback(
    (source: 'manual' | 'auto') => {
      const draftData = buildDraftData();

      if (!hasDraftContent(draftData) || typeof window === 'undefined') {
        return;
      }

      const nextDraftKey =
        mode === 'create'
          ? activeCreateDraftKeyRef.current || createEphemeralDraftKey()
          : getDraftKey(originalSlug || slug);
      const previousDraftKey = lastPersistedDraftKeyRef.current;

      if (previousDraftKey && previousDraftKey !== nextDraftKey) {
        removeEditorDraft(window.localStorage, previousDraftKey);
      }

      saveEditorDraft(window.localStorage, nextDraftKey, draftData);
      if (mode === 'create') {
        activeCreateDraftKeyRef.current = nextDraftKey;
      }
      lastPersistedDraftKeyRef.current = nextDraftKey;
      setActiveDraftKey(nextDraftKey);
      const savedAt = new Date(draftData.updatedDate || new Date().toISOString());
      setLastSavedAt(savedAt);
      setAutosaveState('saved');
      setHasUserChanges(false);
      setManualSaveNotice(source === 'manual' ? 'saved' : null);

      if (source === 'manual') {
        setIsSaving(false);
      }
    },
    [buildDraftData, createEphemeralDraftKey, getDraftKey, mode, originalSlug, slug]
  );

  const hasMeaningfulChanges = hasUserChanges && hasDraftContent(buildDraftData());

  // 임시저장
  const handleSaveDraft = useCallback(() => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      persistDraft('manual');
      if (manualSaveNoticeTimerRef.current) {
        window.clearTimeout(manualSaveNoticeTimerRef.current);
      }
      manualSaveNoticeTimerRef.current = window.setTimeout(() => {
        setManualSaveNotice(null);
      }, 2200);
    } catch (err) {
      console.error('저장 오류:', err);
      setAutosaveState('error');
      setManualSaveNotice('error');
      alert('저장에 실패했습니다.');
      setIsSaving(false);
    }
  }, [isSaving, persistDraft]);

  useEffect(() => {
    return () => {
      if (manualSaveNoticeTimerRef.current) {
        window.clearTimeout(manualSaveNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!hasMeaningfulChanges) return;

    const draftData = buildDraftData();
    if (!hasDraftContent(draftData)) return;

    setAutosaveState('saving');

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      try {
        persistDraft('auto');
      } catch (error) {
        console.error('자동저장 오류:', error);
        setAutosaveState('error');
      }
    }, 1500);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [buildDraftData, hasMeaningfulChanges, isLoading, persistDraft]);

  useEffect(() => {
    if (isLoading) return;

    const handlePageHide = () => {
      if (!hasMeaningfulChanges) return;

      try {
        persistDraft('auto');
      } catch (error) {
        console.error('페이지 종료 전 저장 오류:', error);
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [hasMeaningfulChanges, isLoading, persistDraft]);

  useEffect(() => {
    if (isLoading || !hasMeaningfulChanges) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasMeaningfulChanges, isLoading]);

  const formatSavedAt = (date: Date | null) => {
    if (!date) return '';

    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // 나가기
  const handleExit = () => {
    if (!hasMeaningfulChanges || confirm('저장되지 않은 변경이 있습니다. 나가시겠습니까?')) {
      window.location.href = '/admin';
    }
  };

  const handleDownloadMarkdown = useCallback(() => {
    const resolvedSlug = slug || deriveSlug(title) || 'untitled-post';
    const markdown = generateMarkdownContent({
      title: title || '제목 없음',
      description,
      content,
      heroImage,
      tags,
      slug: resolvedSlug,
      readingTime: calculateReadingTime(content),
      isPublic,
      pubDate: originalPubDate || new Date().toISOString(),
      updatedDate: new Date().toISOString(),
    });

    const fileName = generateMarkdownFileName({
      slug: resolvedSlug,
      pubDate: originalPubDate || new Date().toISOString(),
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }, [calculateReadingTime, content, deriveSlug, description, heroImage, isPublic, originalPubDate, slug, tags, title]);

  const handleDiscardDraft = useCallback(async () => {
    const draftKeyToRemove = lastPersistedDraftKeyRef.current || activeDraftKey;
    const hasCurrentSnapshot = Boolean(draftKeyToRemove || hasMeaningfulChanges);

    if (!hasCurrentSnapshot) {
      return;
    }

    const message =
      mode === 'edit'
        ? '로컬 초안을 버리고 발행된 원본으로 되돌릴까요?'
        : '현재 로컬 초안을 버리고 새 글 상태로 되돌릴까요?';

    if (!window.confirm(message)) {
      return;
    }

    if (typeof window !== 'undefined' && draftKeyToRemove) {
      removeEditorDraft(window.localStorage, draftKeyToRemove);
    }

    lastPersistedDraftKeyRef.current = null;
    setActiveDraftKey(null);
    setAutosaveState('idle');
    setLastSavedAt(null);
    setHasUserChanges(false);

    if (mode === 'edit') {
      setIsLoading(true);
      await loadMarkdownPost(originalSlug || slug || initialPostId || '');
      return;
    }

    activeCreateDraftKeyRef.current = createEphemeralDraftKey();
    resetEditorState();
  }, [activeDraftKey, createEphemeralDraftKey, hasMeaningfulChanges, initialPostId, mode, originalSlug, resetEditorState, slug]);

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  // 에러 상태
  if (loadError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-white">
        <p className="text-red-500">{loadError}</p>
        <a href="/admin/posts" className="text-brand hover:underline">
          포스트 목록으로 돌아가기
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <input
        ref={importInputRef}
        type="file"
        accept=".md,.markdown,.txt"
        onChange={handleImportMarkdown}
        className="hidden"
      />

      {/* 에디터 컨텐츠 영역 - 배경은 전체 너비, 콘텐츠는 992px 중앙 정렬 */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[992px] px-4 pb-6 pt-6 sm:px-6 lg:px-8">
          {/* 제목 */}
          <input
            type="text"
            value={title}
            onChange={(e) => {
              markDirty();
              setTitle(e.target.value);
            }}
            placeholder="제목을 입력하세요"
            className="w-full bg-transparent text-[2.75rem] font-bold text-gray-900 placeholder:text-gray-300 focus:outline-none leading-tight"
          />

          {/* 구분선 */}
          <div className="my-4 h-[6px] w-16 bg-gray-900" />

          {/* 태그 입력 */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded bg-gray-100 px-3 py-1 text-brand"
              >
                {tag}
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-1 text-gray-400 hover:text-red-500"
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => {
                setIsComposing(false);
              }}
              placeholder="태그를 입력하세요"
              className="bg-transparent text-gray-500 placeholder:text-gray-400 focus:outline-none"
            />
          </div>

          <EditorMetaPanel
            title={title}
            content={content}
            slug={slug}
            setSlug={(value) => {
              markDirty();
              setSlug(value);
            }}
            description={description}
            setDescription={(value) => {
              markDirty();
              setDescription(value);
            }}
            isPublic={isPublic}
            setIsPublic={(value) => {
              markDirty();
              setIsPublic(value);
            }}
            tagCount={tags.length}
            heroImage={heroImage}
            setHeroImage={(value) => {
              markDirty();
              setHeroImage(value);
            }}
            readingTime={calculateReadingTime(content)}
          />

          <div className="mt-6 min-h-[55vh]">
            <Suspense fallback={<EditorSurfaceFallback />}>
              <CodeMirrorEditor
                key={editorKey}
                defaultValue={content}
                onChange={handleContentChange}
                placeholder="당신의 이야기를 적어보세요..."
                showShortcutsHelp={true}
                enableImageUpload={true}
                onUploadError={handleUploadError}
                onSave={handleSaveDraft}
                className="h-full min-h-[55vh] w-full"
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* 하단 버튼 영역 (Velog 스타일) */}
      <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
        <button
          onClick={handleExit}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 19l-7-7m0 0l7-7m-7 7h18"
            />
          </svg>
          <span>나가기</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {autosaveState === 'saving' && '자동 저장 중...'}
            {autosaveState === 'saved' && lastSavedAt && `자동 저장됨 · ${formatSavedAt(lastSavedAt)}`}
            {autosaveState === 'error' && '자동 저장 실패'}
          </span>
          {manualSaveNotice && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                manualSaveNotice === 'saved'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-600'
              }`}
            >
              {manualSaveNotice === 'saved' ? '임시저장 완료' : '임시저장 실패'}
            </span>
          )}
          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="px-4 py-2 text-gray-500 hover:text-gray-700"
          >
            마크다운 내보내기
          </button>
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="px-4 py-2 text-gray-500 hover:text-gray-700"
          >
            마크다운 불러오기
          </button>
          <button
            type="button"
            onClick={() => void handleDiscardDraft()}
            disabled={!activeDraftKey && !hasMeaningfulChanges}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:text-gray-300"
          >
            초안 폐기
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="rounded-lg border border-brand/20 px-4 py-2 text-brand transition hover:bg-brand/5"
          >
            {isSaving ? '저장 중...' : '임시저장'}
          </button>
          <button
            onClick={() => setShowPublishModal(true)}
            className="rounded-lg bg-brand px-5 py-2 font-medium text-white hover:brightness-110"
          >
            출간하기
          </button>
        </div>
      </div>

      {/* 출간 모달 */}
      {showPublishModal && (
        <Suspense fallback={<PublishModalFallback />}>
          <PublishModal
            title={title}
            content={content}
            tags={tags}
            onClose={() => setShowPublishModal(false)}
            calculateReadingTime={calculateReadingTime}
            description={description}
            heroImage={heroImage}
            slug={slug}
            isPublic={isPublic}
            pubDate={originalPubDate}
            originalSlug={originalSlug}
            onPublished={(result: PublishFeedback) => {
              const nextDraftKey =
                mode === 'create'
                  ? activeCreateDraftKeyRef.current
                  : getDraftKey(originalSlug || result.slug);
              if (lastPersistedDraftKeyRef.current) {
                removeEditorDraft(window.localStorage, lastPersistedDraftKeyRef.current);
              }
              if (nextDraftKey && nextDraftKey !== lastPersistedDraftKeyRef.current) {
                removeEditorDraft(window.localStorage, nextDraftKey);
              }
              lastPersistedDraftKeyRef.current = null;
              activeCreateDraftKeyRef.current = null;
              setActiveDraftKey(null);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
