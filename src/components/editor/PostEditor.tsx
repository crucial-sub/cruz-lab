// TipTap 기반 블로그 포스트 에디터
// 마크다운 지원, 이미지 업로드, 코드 하이라이팅 포함
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { useState, useEffect, useCallback } from 'react';
import EditorToolbar from './EditorToolbar';
import MetadataPanel from './MetadataPanel';
import { useAutoSave } from '@/hooks/useAutoSave';
import { db, storage, initializeFirebase } from '@/lib/firebase';
import { collection, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import imageCompression from 'browser-image-compression';

// lowlight 인스턴스 생성 (코드 하이라이팅용)
const lowlight = createLowlight(common);

interface PostData {
  id?: string;
  title: string;
  description: string;
  content: string;
  heroImage?: string;
  tags: string[];
  status: 'draft' | 'published';
  slug: string;
}

interface Props {
  initialData?: PostData;
  mode: 'create' | 'edit';
}

export default function PostEditor({ initialData, mode }: Props) {
  // 메타데이터 상태
  const [title, setTitle] = useState(initialData?.title || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [tags, setTags] = useState<string[]>(initialData?.tags || []);
  const [heroImage, setHeroImage] = useState(initialData?.heroImage || '');
  const [slug, setSlug] = useState(initialData?.slug || '');

  // UI 상태
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [postId, setPostId] = useState(initialData?.id || null);

  // Firebase 초기화
  useEffect(() => {
    initializeFirebase();
  }, []);

  // TipTap 에디터 설정
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false, // CodeBlockLowlight 사용
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'rounded-lg max-w-full',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-brand underline',
        },
      }),
      Placeholder.configure({
        placeholder: '내용을 입력하세요... (마크다운 문법 지원)',
      }),
      CodeBlockLowlight.configure({
        lowlight,
        HTMLAttributes: {
          class: 'rounded-lg bg-gray-900 p-4 text-sm',
        },
      }),
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: initialData?.content || '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none min-h-[400px] focus:outline-none px-4 py-3',
      },
      // 이미지 드롭 핸들러
      handleDrop: (view, event, _slice, moved) => {
        if (!moved && event.dataTransfer?.files.length) {
          const file = event.dataTransfer.files[0];
          if (file.type.startsWith('image/')) {
            event.preventDefault();
            handleImageUpload(file);
            return true;
          }
        }
        return false;
      },
      // 이미지 붙여넣기 핸들러
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items;
        if (items) {
          for (const item of items) {
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) handleImageUpload(file);
              return true;
            }
          }
        }
        return false;
      },
    },
  });

  // 이미지 업로드 핸들러
  const handleImageUpload = useCallback(async (file: File) => {
    if (!editor) return;

    try {
      // 이미지 압축 (최대 1MB, WebP로 변환)
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp' as const,
      };

      const compressedFile = await imageCompression(file, options);

      // Firebase Storage에 업로드
      const timestamp = Date.now();
      const fileName = `${timestamp}-${file.name.replace(/\.[^/.]+$/, '')}.webp`;
      const storageRef = ref(storage, `images/${postId || 'temp'}/${fileName}`);

      await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(storageRef);

      // 에디터에 이미지 삽입
      editor.chain().focus().setImage({ src: downloadURL }).run();
    } catch (err) {
      console.error('이미지 업로드 오류:', err);
      setError('이미지 업로드에 실패했습니다.');
    }
  }, [editor, postId]);

  // 마크다운 콘텐츠 가져오기
  const getMarkdownContent = useCallback(() => {
    if (!editor) return '';
    return editor.storage.markdown.getMarkdown();
  }, [editor]);

  // slug 자동 생성
  useEffect(() => {
    if (mode === 'create' && title && !slug) {
      const generatedSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50);
      setSlug(generatedSlug);
    }
  }, [title, mode, slug]);

  // 읽기 시간 계산
  const calculateReadingTime = (content: string): number => {
    const wordsPerMinute = 200;
    const words = content.trim().split(/\s+/).length;
    return Math.ceil(words / wordsPerMinute);
  };

  // 초안 저장
  const saveDraft = useCallback(async () => {
    if (!editor || isSaving) return;

    setIsSaving(true);
    setError(null);

    try {
      const content = getMarkdownContent();
      const postData = {
        title,
        description,
        content,
        heroImage,
        tags,
        slug,
        status: 'draft' as const,
        updatedDate: Timestamp.now(),
        readingTime: calculateReadingTime(content),
      };

      if (postId) {
        // 기존 포스트 업데이트
        await updateDoc(doc(db, 'posts', postId), postData);
      } else {
        // 새 포스트 생성
        const docRef = await addDoc(collection(db, 'posts'), {
          ...postData,
          createdAt: Timestamp.now(),
          pubDate: Timestamp.now(),
        });
        setPostId(docRef.id);
      }

      setLastSaved(new Date());
    } catch (err) {
      console.error('저장 오류:', err);
      setError('저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  }, [editor, title, description, heroImage, tags, slug, postId, getMarkdownContent, isSaving]);

  // 자동 저장 (5초 디바운스)
  useAutoSave({
    data: { title, description, content: editor?.getHTML() || '', tags },
    onSave: saveDraft,
    delay: 5000,
    enabled: !!editor && (!!title || !!editor?.getText()),
  });

  // 발행
  const handlePublish = async () => {
    if (!editor || !title) {
      setError('제목을 입력해주세요.');
      return;
    }

    if (!slug) {
      setError('URL 슬러그를 입력해주세요.');
      return;
    }

    setIsPublishing(true);
    setError(null);

    try {
      const content = getMarkdownContent();
      const basePostData = {
        title,
        description,
        content,
        heroImage,
        tags,
        slug,
        status: 'published' as const,
        updatedDate: Timestamp.now(),
        readingTime: calculateReadingTime(content),
      };

      if (postId) {
        // 기존 포스트 업데이트 - pubDate는 변경하지 않음
        await updateDoc(doc(db, 'posts', postId), basePostData);
      } else {
        // 새 포스트 생성 - pubDate 설정
        const docRef = await addDoc(collection(db, 'posts'), {
          ...basePostData,
          createdAt: Timestamp.now(),
          pubDate: Timestamp.now(),
        });
        setPostId(docRef.id);
      }

      // 발행 완료 후 목록으로 이동
      window.location.href = '/admin/posts';
    } catch (err) {
      console.error('발행 오류:', err);
      setError('발행에 실패했습니다.');
    } finally {
      setIsPublishing(false);
    }
  };

  if (!editor) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
      {/* 에디터 영역 */}
      <div className="space-y-4">
        {/* 제목 입력 */}
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목을 입력하세요"
          className="w-full bg-transparent text-3xl font-bold text-text-primary placeholder:text-text-secondary/50 focus:outline-none"
        />

        {/* 툴바 */}
        <EditorToolbar editor={editor} onImageUpload={handleImageUpload} />

        {/* 에디터 */}
        <div className="rounded-2xl border border-border bg-bg-surface">
          <EditorContent editor={editor} />
        </div>

        {/* 상태 표시 */}
        <div className="flex items-center justify-between text-sm text-text-secondary">
          <div className="flex items-center gap-4">
            {isSaving && (
              <span className="flex items-center gap-2">
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                저장 중...
              </span>
            )}
            {lastSaved && !isSaving && (
              <span>마지막 저장: {lastSaved.toLocaleTimeString('ko-KR')}</span>
            )}
          </div>
          <span>{editor.storage.characterCount?.characters() || 0}자</span>
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="rounded-xl bg-red-500/10 p-4 text-red-500">
            {error}
          </div>
        )}
      </div>

      {/* 사이드 패널 */}
      <MetadataPanel
        description={description}
        setDescription={setDescription}
        tags={tags}
        setTags={setTags}
        heroImage={heroImage}
        setHeroImage={setHeroImage}
        slug={slug}
        setSlug={setSlug}
        onSaveDraft={saveDraft}
        onPublish={handlePublish}
        isSaving={isSaving}
        isPublishing={isPublishing}
      />
    </div>
  );
}
