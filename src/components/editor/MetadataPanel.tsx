// 메타데이터 사이드 패널
// 설명, 태그, 썸네일, slug 입력 + 저장/발행 버튼
import { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import imageCompression from 'browser-image-compression';

interface Props {
  description: string;
  setDescription: (value: string) => void;
  tags: string[];
  setTags: (tags: string[]) => void;
  heroImage: string;
  setHeroImage: (url: string) => void;
  slug: string;
  setSlug: (value: string) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  isSaving: boolean;
  isPublishing: boolean;
}

export default function MetadataPanel({
  description,
  setDescription,
  tags,
  setTags,
  heroImage,
  setHeroImage,
  slug,
  setSlug,
  onSaveDraft,
  onPublish,
  isSaving,
  isPublishing,
}: Props) {
  const [tagInput, setTagInput] = useState('');
  const [isUploadingHero, setIsUploadingHero] = useState(false);
  const heroInputRef = useRef<HTMLInputElement>(null);

  // 태그 추가
  const handleAddTag = () => {
    const newTag = tagInput.trim();
    if (newTag && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
      setTagInput('');
    }
  };

  // 태그 제거
  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  // Enter 키로 태그 추가
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // 썸네일 업로드
  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingHero(true);
    try {
      // 이미지 압축
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp' as const,
      };
      const compressedFile = await imageCompression(file, options);

      // 업로드
      const timestamp = Date.now();
      const fileName = `hero-${timestamp}.webp`;
      const storageRef = ref(storage, `images/heroes/${fileName}`);
      await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(storageRef);

      setHeroImage(downloadURL);
    } catch (error) {
      console.error('썸네일 업로드 오류:', error);
    } finally {
      setIsUploadingHero(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* 발행 버튼 */}
      <div className="rounded-2xl border border-border bg-bg-surface p-4">
        <div className="space-y-3">
          <button
            type="button"
            onClick={onPublish}
            disabled={isPublishing}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPublishing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                발행 중...
              </>
            ) : (
              <>
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M5 13l4 4L19 7" />
                </svg>
                발행하기
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 font-semibold text-text-primary transition-colors hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? '저장 중...' : '초안 저장'}
          </button>
        </div>
      </div>

      {/* 설명 */}
      <div className="rounded-2xl border border-border bg-bg-surface p-4">
        <label className="mb-2 block text-sm font-medium text-text-primary">
          설명 (SEO)
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="포스트 설명을 입력하세요..."
          rows={3}
          className="w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <p className="mt-1 text-xs text-text-secondary">
          {description.length}/160자
        </p>
      </div>

      {/* URL Slug */}
      <div className="rounded-2xl border border-border bg-bg-surface p-4">
        <label className="mb-2 block text-sm font-medium text-text-primary">
          URL Slug
        </label>
        <div className="flex items-center gap-1 rounded-xl border border-border bg-bg px-3 py-2">
          <span className="text-sm text-text-secondary">/blog/</span>
          <input
            type="text"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9가-힣-]/g, ''))}
            placeholder="url-slug"
            className="flex-1 bg-transparent text-sm focus:outline-none"
          />
        </div>
      </div>

      {/* 태그 */}
      <div className="rounded-2xl border border-border bg-bg-surface p-4">
        <label className="mb-2 block text-sm font-medium text-text-primary">
          태그
        </label>
        <div className="mb-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-sm text-brand"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="ml-1 hover:text-red-500"
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="태그 입력 후 Enter"
            className="flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm focus:border-brand focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddTag}
            className="rounded-lg bg-bg-hover px-3 py-2 text-sm font-medium text-text-primary hover:bg-brand hover:text-white"
          >
            추가
          </button>
        </div>
      </div>

      {/* 썸네일 */}
      <div className="rounded-2xl border border-border bg-bg-surface p-4">
        <label className="mb-2 block text-sm font-medium text-text-primary">
          썸네일 이미지
        </label>
        {heroImage ? (
          <div className="relative">
            <img
              src={heroImage}
              alt="썸네일"
              className="w-full rounded-xl object-cover"
            />
            <button
              type="button"
              onClick={() => setHeroImage('')}
              className="absolute right-2 top-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => heroInputRef.current?.click()}
            disabled={isUploadingHero}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-8 text-text-secondary hover:border-brand hover:text-brand"
          >
            {isUploadingHero ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
            ) : (
              <>
                <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">클릭하여 업로드</span>
              </>
            )}
          </button>
        )}
        <input
          ref={heroInputRef}
          type="file"
          accept="image/*"
          onChange={handleHeroUpload}
          className="hidden"
        />
      </div>
    </div>
  );
}
