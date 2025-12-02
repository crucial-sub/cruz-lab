// 풀스크린 에디터 컴포넌트
// Velog 스타일: 좌측 마크다운 스타일 에디터 + 우측 렌더링 미리보기
import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { db, storage, initializeFirebase } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';
import PublishModal from './PublishModal';

interface Props {
  mode: 'create' | 'edit';
  postId?: string;
}

// 마크다운 구문 강조 스타일 (Velog 스타일) - 컴포넌트 외부에서 정의
const markdownHighlightStyle = HighlightStyle.define([
  // 헤딩 - # 포함 전체 라인이 크고 굵게
  { tag: t.heading1, fontSize: '2rem', fontWeight: '700', color: '#212529' },
  { tag: t.heading2, fontSize: '1.5rem', fontWeight: '600', color: '#212529' },
  { tag: t.heading3, fontSize: '1.25rem', fontWeight: '600', color: '#212529' },
  { tag: t.heading4, fontSize: '1.125rem', fontWeight: '600', color: '#212529' },
  { tag: t.heading5, fontSize: '1rem', fontWeight: '600', color: '#212529' },
  { tag: t.heading6, fontSize: '1rem', fontWeight: '600', color: '#212529' },
  // 굵게
  { tag: t.strong, fontWeight: '700', color: '#212529' },
  // 이탤릭
  { tag: t.emphasis, fontStyle: 'italic', color: '#212529' },
  // 취소선
  { tag: t.strikethrough, textDecoration: 'line-through', color: '#868e96' },
  // 인용문
  { tag: t.quote, color: '#868e96', fontStyle: 'italic' },
  // 링크
  { tag: t.link, color: '#10b981', textDecoration: 'underline' },
  { tag: t.url, color: '#868e96' },
  // 인라인 코드
  { tag: t.monospace, fontFamily: "'Fira Code', monospace", backgroundColor: '#f1f3f5', color: '#e64980' },
  // 코드블록 언어
  { tag: t.processingInstruction, color: '#868e96' },
]);

// 에디터 기본 테마 - 컴포넌트 외부에서 정의
const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '18px',
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    color: '#212529',
    caretColor: '#10b981',
    fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    lineHeight: '1.8',
  },
  '.cm-cursor': {
    borderLeftColor: '#10b981',
    borderLeftWidth: '2px',
  },
  '.cm-line': {
    padding: '2px 0',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#10b981',
  },
  '.cm-placeholder': {
    color: '#adb5bd',
  },
  '.cm-scroller': {
    fontFamily: "'Pretendard', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-selectionBackground': {
    backgroundColor: '#10b98133 !important',
  },
  '&.cm-focused .cm-selectionBackground': {
    backgroundColor: '#10b98144 !important',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
});

// CodeMirror extensions 배열 - 컴포넌트 외부에서 정의
const editorExtensions = [
  markdown({ base: markdownLanguage, codeLanguages: languages }),
  syntaxHighlighting(markdownHighlightStyle),
  editorTheme,
  EditorView.lineWrapping,
];

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

  const editorViewRef = useRef<EditorView | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // 이미지 업로드
  const handleImageUpload = useCallback(async (file: File) => {
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp' as const,
      };
      const compressedFile = await imageCompression(file, options);
      const timestamp = Date.now();
      const fileName = `${timestamp}-${file.name.replace(/\.[^/.]+$/, '')}.webp`;
      const storageRef = ref(storage, `images/${postId || 'temp'}/${fileName}`);

      await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(storageRef);

      // 마크다운 이미지 문법 삽입
      const imageMarkdown = `\n![${file.name}](${downloadURL})\n`;
      insertTextAtCursor(imageMarkdown);
    } catch (err: any) {
      console.error('이미지 업로드 오류:', err);
      alert(`이미지 업로드 실패: ${err?.message || err}`);
    }
  }, [postId]);

  // 드래그 앤 드롭 이미지 업로드
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        handleImageUpload(file);
      }
    }
  }, [handleImageUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 커서 위치에 텍스트 삽입 (CodeMirror용)
  const insertTextAtCursor = (text: string) => {
    const view = editorViewRef.current;
    if (!view) {
      // fallback: 그냥 content 끝에 추가
      setContent(prev => prev + text);
      return;
    }

    const { state } = view;
    const { from, to } = state.selection.main;

    view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length },
    });
  };

  // 툴바 액션
  const handleToolbarAction = (action: string) => {
    const view = editorViewRef.current;
    if (!view) return;

    const { state } = view;
    const { from, to } = state.selection.main;
    const selectedText = state.sliceDoc(from, to);

    let insertText = '';
    let cursorPos = from;

    switch (action) {
      case 'h1':
        insertText = `# ${selectedText || ''}`;
        cursorPos = from + 2 + selectedText.length;
        break;
      case 'h2':
        insertText = `## ${selectedText || ''}`;
        cursorPos = from + 3 + selectedText.length;
        break;
      case 'h3':
        insertText = `### ${selectedText || ''}`;
        cursorPos = from + 4 + selectedText.length;
        break;
      case 'h4':
        insertText = `#### ${selectedText || ''}`;
        cursorPos = from + 5 + selectedText.length;
        break;
      case 'bold':
        insertText = `**${selectedText || '텍스트'}**`;
        cursorPos = selectedText ? from + insertText.length : from + 2;
        break;
      case 'italic':
        insertText = `*${selectedText || '텍스트'}*`;
        cursorPos = selectedText ? from + insertText.length : from + 1;
        break;
      case 'strike':
        insertText = `~~${selectedText || '텍스트'}~~`;
        cursorPos = selectedText ? from + insertText.length : from + 2;
        break;
      case 'quote':
        insertText = `> ${selectedText || '인용문'}`;
        cursorPos = from + insertText.length;
        break;
      case 'link':
        const url = window.prompt('링크 URL을 입력하세요:');
        if (url) {
          insertText = `[${selectedText || '링크 텍스트'}](${url})`;
          cursorPos = from + insertText.length;
        }
        break;
      case 'code':
        // Velog처럼 코드블록 템플릿 삽입
        if (selectedText) {
          // 선택된 텍스트가 있으면 코드블록으로 감싸기
          insertText = `\`\`\`\n${selectedText}\n\`\`\``;
          cursorPos = from + 4; // 언어 입력 위치
        } else {
          // 선택된 텍스트가 없으면 템플릿 삽입
          insertText = `\`\`\`\n코드를 입력하세요\n\`\`\``;
          cursorPos = from + 4; // 언어 입력 위치
        }
        break;
      case 'image':
        fileInputRef.current?.click();
        return;
      default:
        return;
    }

    if (insertText) {
      view.dispatch({
        changes: { from, to, insert: insertText },
        selection: { anchor: cursorPos },
      });
      view.focus();
    }
  };

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
    <div className="flex h-screen bg-white">
      {/* 좌측: 마크다운 스타일 에디터 */}
      <div className="flex w-1/2 flex-col border-r border-gray-200">
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
                <button onClick={() => handleRemoveTag(tag)} className="ml-1 text-gray-400 hover:text-red-500">×</button>
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

          {/* 툴바 */}
          <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-gray-100 pb-4">
            <ToolbarButton onClick={() => handleToolbarAction('h1')}>H<sub>1</sub></ToolbarButton>
            <ToolbarButton onClick={() => handleToolbarAction('h2')}>H<sub>2</sub></ToolbarButton>
            <ToolbarButton onClick={() => handleToolbarAction('h3')}>H<sub>3</sub></ToolbarButton>
            <ToolbarButton onClick={() => handleToolbarAction('h4')}>H<sub>4</sub></ToolbarButton>
            <div className="mx-2 h-4 w-px bg-gray-200" />
            <ToolbarButton onClick={() => handleToolbarAction('bold')}><span className="font-bold">B</span></ToolbarButton>
            <ToolbarButton onClick={() => handleToolbarAction('italic')}><span className="italic">I</span></ToolbarButton>
            <ToolbarButton onClick={() => handleToolbarAction('strike')}><span className="line-through">T</span></ToolbarButton>
            <div className="mx-2 h-4 w-px bg-gray-200" />
            <ToolbarButton onClick={() => handleToolbarAction('quote')}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z"/></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => handleToolbarAction('link')}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => handleToolbarAction('image')}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" /></svg>
            </ToolbarButton>
            <ToolbarButton onClick={() => handleToolbarAction('code')}>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16,18 22,12 16,6" /><polyline points="8,6 2,12 8,18" /></svg>
            </ToolbarButton>
          </div>

          {/* 숨겨진 파일 인풋 */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleImageUpload(file);
              }
              e.target.value = '';
            }}
            className="hidden"
          />

          {/* CodeMirror 마크다운 에디터 */}
          <div
            className="flex-1 overflow-hidden"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <CodeMirror
              value={content}
              onChange={(value) => setContent(value)}
              extensions={editorExtensions}
              theme="light"
              placeholder="당신의 이야기를 적어보세요..."
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLine: false,
                highlightSelectionMatches: false,
                indentOnInput: true,
              }}
              onCreateEditor={(view) => {
                editorViewRef.current = view;
              }}
              className="h-full [&_.cm-editor]:h-full [&_.cm-scroller]:h-full"
            />
          </div>
        </div>

        {/* 하단 버튼 영역 (Velog 스타일) */}
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
          <button
            onClick={handleExit}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
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
      </div>

      {/* 우측: 마크다운 렌더링 미리보기 */}
      <div className="w-1/2 overflow-y-auto bg-gray-50 p-8">
        <article className="prose prose-lg max-w-none">
          {title && <h1 className="text-[2.75rem] font-bold text-gray-900 leading-tight mb-8">{title}</h1>}
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks]}
            rehypePlugins={[rehypeHighlight, rehypeRaw]}
            components={{
              h1: ({ children }) => <h1 className="text-3xl font-bold text-gray-900 mt-8 mb-4">{children}</h1>,
              h2: ({ children }) => <h2 className="text-2xl font-semibold text-gray-900 mt-6 mb-3">{children}</h2>,
              h3: ({ children }) => <h3 className="text-xl font-semibold text-gray-900 mt-5 mb-2">{children}</h3>,
              h4: ({ children }) => <h4 className="text-lg font-semibold text-gray-900 mt-4 mb-2">{children}</h4>,
              p: ({ children }) => <p className="text-gray-700 leading-relaxed my-4">{children}</p>,
              a: ({ href, children }) => <a href={href} className="text-brand underline hover:brightness-110">{children}</a>,
              blockquote: ({ children }) => <blockquote className="border-l-4 border-brand pl-4 my-4 text-gray-600 italic">{children}</blockquote>,
              code: ({ className, children }) => {
                const isInline = !className;
                return isInline
                  ? <code className="bg-gray-100 text-red-500 px-1.5 py-0.5 rounded text-sm font-mono">{children}</code>
                  : <code className={className}>{children}</code>;
              },
              pre: ({ children }) => <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto my-4 text-sm">{children}</pre>,
              ul: ({ children }) => <ul className="list-disc list-inside my-4 space-y-1 text-gray-700">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal list-inside my-4 space-y-1 text-gray-700">{children}</ol>,
              li: ({ children }) => <li className="text-gray-700">{children}</li>,
              img: ({ src, alt }) => <img src={src} alt={alt} className="rounded-lg max-w-full my-4" />,
              hr: () => <hr className="border-gray-200 my-8" />,
              strong: ({ children }) => <strong className="font-bold text-gray-900">{children}</strong>,
              em: ({ children }) => <em className="italic">{children}</em>,
              del: ({ children }) => <del className="line-through text-gray-500">{children}</del>,
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
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

// 툴바 버튼 컴포넌트
function ToolbarButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded p-2 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
    >
      {children}
    </button>
  );
}
