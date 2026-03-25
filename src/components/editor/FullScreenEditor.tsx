/**
 * 풀스크린 에디터 컴포넌트
 *
 * Milkdown 기반 WYSIWYG 에디터로 Live Preview 모드를 지원합니다.
 * - 기존 Velog 스타일 좌우 분할 → 단일 WYSIWYG 에디터로 변경
 * - Markdown 기반 출간 경로 사용
 * - 임시저장은 localStorage에 저장
 * - Firebase Storage 이미지 업로드 통합
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { hasDraftContent, saveEditorDraft, type EditorDraftPayload } from '@/lib/editor-drafts';
import { initializeFirebase } from '@/lib/firebase';
import { parseMarkdownDocument } from '@/lib/markdown-publish';
import MilkdownEditor from './MilkdownEditor';
import PublishModal from './PublishModal';

interface Props {
  mode: 'create' | 'edit';
  postId?: string;
}

export default function FullScreenEditor({ mode, postId: initialPostId }: Props) {
  const getDraftKey = useCallback((targetSlug?: string) => {
    if (targetSlug) return `cruz-lab-editor-draft:${targetSlug}`;
    return 'cruz-lab-editor-draft:new';
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

  // 출간 설정 상태 (편집 시 기존 값 유지)
  const [heroImage, setHeroImage] = useState('');
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [originalSlug, setOriginalSlug] = useState('');
  const [originalPubDate, setOriginalPubDate] = useState<string>('');
  const importInputRef = useRef<HTMLInputElement>(null);

  // 에디터 마운트 키 (defaultValue 변경 시 에디터 재생성용)
  const [editorKey, setEditorKey] = useState(0);
  const autosaveTimerRef = useRef<number | null>(null);

  // Firebase 초기화 및 데이터 로드
  useEffect(() => {
    initializeFirebase();

    if (mode === 'edit') {
      const urlParams = new URLSearchParams(window.location.search);
      const targetSlug = urlParams.get('slug');
      const legacyPostId = urlParams.get('id') || initialPostId;

      if (targetSlug) {
        loadMarkdownPost(targetSlug);
        return;
      }

      if (!legacyPostId) {
        setLoadError('포스트 slug가 없습니다.');
        setIsLoading(false);
        return;
      }

      loadLegacyPost(legacyPostId);
      return;
    }

    tryLoadDraft();
  }, [mode, initialPostId]);

  const tryLoadDraft = useCallback((targetSlug?: string) => {
    if (typeof window === 'undefined') return;

    const raw = window.localStorage.getItem(getDraftKey(targetSlug));
    if (!raw) return;

    try {
      const draft = JSON.parse(raw);
      setTitle(draft.title || '');
      setContent(draft.content || '');
      setTags(draft.tags || []);
      setHeroImage(draft.heroImage || '');
      setDescription(draft.description || '');
      setSlug(draft.slug || targetSlug || '');
      setLastSavedAt(draft.updatedDate ? new Date(draft.updatedDate) : null);
      setAutosaveState(draft.updatedDate ? 'saved' : 'idle');
      setEditorKey((prev) => prev + 1);
    } catch (error) {
      console.error('임시저장 불러오기 오류:', error);
    }
  }, [getDraftKey]);

  const loadMarkdownPost = async (targetSlug: string) => {
    try {
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
      setOriginalSlug(data.slug || targetSlug);
      setOriginalPubDate(data.pubDate || '');
      setEditorKey((prev) => prev + 1);
      tryLoadDraft(targetSlug);
    } catch (err) {
      console.error('포스트 로딩 오류:', err);
      setLoadError('포스트를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 레거시 Firestore 문서 로드
  const loadLegacyPost = async (id: string) => {
    try {
      const { db } = await import('@/lib/firebase');
      const { doc, getDoc } = await import('firebase/firestore');
      const docRef = doc(db, 'posts', id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        setLoadError('포스트를 찾을 수 없습니다.');
        return;
      }

      const data = docSnap.data();
      setTitle(data.title || '');
      setContent(data.content || '');
      setTags(data.tags || []);
      setHeroImage(data.heroImage || '');
      setDescription(data.description || '');
      setSlug(data.slug || '');
      setOriginalSlug(data.slug || '');
      setOriginalPubDate(data.pubDate?.toDate?.()?.toISOString?.() || new Date().toISOString());
      setEditorKey((prev) => prev + 1);
      tryLoadDraft(data.slug || undefined);
    } catch (err) {
      console.error('포스트 로딩 오류:', err);
      setLoadError('포스트를 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  // 마크다운 변경 핸들러
  const handleContentChange = useCallback((markdown: string) => {
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
      setOriginalPubDate(parsed.pubDate || '');

      if (mode === 'edit') {
        setOriginalSlug(parsed.slug || originalSlug);
      } else {
        setOriginalSlug('');
      }

      setEditorKey((prev) => prev + 1);
    } catch (error) {
      console.error('마크다운 파일 불러오기 오류:', error);
      alert(error instanceof Error ? error.message : '마크다운 파일을 불러오지 못했습니다.');
    } finally {
      event.target.value = '';
    }
  }, [content, description, mode, originalSlug, tags.length, title]);

  // 태그 추가 (한글 IME 이슈 수정)
  const handleAddTag = () => {
    if (isComposing) return; // 한글 조합 중이면 무시

    const newTag = tagInput.trim();
    if (newTag && !tags.includes(newTag)) {
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
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  // 읽기 시간 계산
  const calculateReadingTime = (text: string): number => {
    const wordsPerMinute = 200;
    const words = text.trim().split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute);
  };

  const buildDraftData = useCallback((): EditorDraftPayload => ({
    title: title || '제목 없음',
    description,
    content,
    tags,
    slug,
    heroImage,
    updatedDate: new Date().toISOString(),
    readingTime: calculateReadingTime(content),
  }), [title, description, content, tags, slug, heroImage]);

  const persistDraft = useCallback(
    (source: 'manual' | 'auto') => {
      const draftData = buildDraftData();

      if (!hasDraftContent(draftData) || typeof window === 'undefined') {
        return;
      }

      saveEditorDraft(window.localStorage, getDraftKey(originalSlug || slug), draftData);
      const savedAt = new Date(draftData.updatedDate || new Date().toISOString());
      setLastSavedAt(savedAt);
      setAutosaveState('saved');

      if (source === 'manual') {
        setIsSaving(false);
      }
    },
    [buildDraftData, getDraftKey, originalSlug, slug]
  );

  // 임시저장
  const handleSaveDraft = useCallback(() => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      persistDraft('manual');
    } catch (err) {
      console.error('저장 오류:', err);
      setAutosaveState('error');
      alert('저장에 실패했습니다.');
      setIsSaving(false);
    }
  }, [isSaving, persistDraft]);

  useEffect(() => {
    if (isLoading) return;

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
  }, [buildDraftData, isLoading, persistDraft]);

  useEffect(() => {
    if (isLoading) return;

    const handlePageHide = () => {
      try {
        persistDraft('auto');
      } catch (error) {
        console.error('페이지 종료 전 저장 오류:', error);
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => window.removeEventListener('pagehide', handlePageHide);
  }, [isLoading, persistDraft]);

  const formatSavedAt = (date: Date | null) => {
    if (!date) return '';

    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // 나가기
  const handleExit = () => {
    if (confirm('작성 중인 내용이 있습니다. 나가시겠습니까?')) {
      window.location.href = '/admin';
    }
  };

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
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 콘텐츠 컨테이너 - Readable Line Length (992px, Obsidian 스타일) */}
        <div className="mx-auto w-full max-w-[992px] px-8 pt-8">
          {/* 제목 */}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
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
        </div>

        {/* Milkdown WYSIWYG 에디터 - 992px 중앙 정렬 */}
        <div className="flex-1 overflow-auto px-8 py-2">
          <div className="mx-auto w-full max-w-[992px]">
            <MilkdownEditor
              key={editorKey}
              defaultValue={content}
              onChange={handleContentChange}
              placeholder="당신의 이야기를 적어보세요..."
              enableSlash={true}
              showShortcutsHelp={true}
              enableImageUpload={true}
              onUploadError={handleUploadError}
              onSave={handleSaveDraft}
              showImportButton={false}
              className="h-full w-full"
            />
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
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            className="px-4 py-2 text-gray-500 hover:text-gray-700"
          >
            마크다운 불러오기
          </button>
          <button
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="px-4 py-2 text-brand hover:underline"
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
        <PublishModal
          title={title}
          content={content}
          tags={tags}
          onClose={() => setShowPublishModal(false)}
          calculateReadingTime={calculateReadingTime}
          initialHeroImage={heroImage}
          initialDescription={description}
          initialSlug={slug}
          initialPubDate={originalPubDate}
          originalSlug={originalSlug}
          onPublished={(publishedSlug) => {
            window.localStorage.removeItem(getDraftKey(originalSlug || publishedSlug));
          }}
        />
      )}
    </div>
  );
}
