/**
 * 풀스크린 에디터 컴포넌트
 *
 * Milkdown 기반 WYSIWYG 에디터로 Live Preview 모드를 지원합니다.
 * - 기존 Velog 스타일 좌우 분할 → 단일 WYSIWYG 에디터로 변경
 * - Firestore 저장/로드 로직 유지
 * - Firebase Storage 이미지 업로드 통합
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { db, initializeFirebase } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import MilkdownEditor from './MilkdownEditor';
import PublishModal from './PublishModal';

interface Props {
  mode: 'create' | 'edit';
  postId?: string;
}

export default function FullScreenEditor({ mode, postId: initialPostId }: Props) {
  // 상태
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [postId, setPostId] = useState<string | null>(initialPostId || null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isLoading, setIsLoading] = useState(mode === 'edit');
  const [loadError, setLoadError] = useState<string | null>(null);

  // 에디터 마운트 키 (defaultValue 변경 시 에디터 재생성용)
  const [editorKey, setEditorKey] = useState(0);

  // Firebase 초기화 및 데이터 로드
  useEffect(() => {
    initializeFirebase();

    if (mode === 'edit') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlPostId = urlParams.get('id') || initialPostId;

      if (!urlPostId) {
        setLoadError('포스트 ID가 없습니다.');
        setIsLoading(false);
        return;
      }

      setPostId(urlPostId);
      loadPost(urlPostId);
    }
  }, [mode, initialPostId]);

  // 포스트 데이터 로드
  const loadPost = async (id: string) => {
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      const docRef = doc(db, 'posts', id);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setTitle(data.title || '');
        setContent(data.content || '');
        setTags(data.tags || []);
        // 에디터 재생성하여 새로운 defaultValue 적용
        setEditorKey((prev) => prev + 1);
      } else {
        setLoadError('포스트를 찾을 수 없습니다.');
      }
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

  // 임시저장
  const handleSaveDraft = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const postData = {
        title: title || '제목 없음',
        description: '',
        content,
        tags,
        slug: '',
        status: 'draft' as const,
        updatedDate: Timestamp.now(),
        readingTime: calculateReadingTime(content),
      };

      if (postId) {
        await updateDoc(doc(db, 'posts', postId), postData);
      } else {
        const docRef = await addDoc(collection(db, 'posts'), {
          ...postData,
          createdAt: Timestamp.now(),
          pubDate: Timestamp.now(),
        });
        setPostId(docRef.id);
      }
    } catch (err) {
      console.error('저장 오류:', err);
      alert('저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
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
      {/* 에디터 컨텐츠 영역 */}
      <div className="flex flex-1 flex-col overflow-hidden p-8">
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

        {/* Milkdown WYSIWYG 에디터 */}
        <div className="flex-1 overflow-auto w-full">
          <MilkdownEditor
            key={editorKey}
            defaultValue={content}
            onChange={handleContentChange}
            placeholder="당신의 이야기를 적어보세요..."
            enableSlash={true}
            showShortcutsHelp={true}
            enableImageUpload={true}
            onUploadError={handleUploadError}
            className="h-full w-full"
          />
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
          postId={postId}
          onClose={() => setShowPublishModal(false)}
          calculateReadingTime={calculateReadingTime}
        />
      )}
    </div>
  );
}
