// 출간 설정 모달
// 썸네일, 설명, URL, 공개 설정 등
import { useState, useRef, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import imageCompression from 'browser-image-compression';

interface Props {
  title: string;
  content: string;
  tags: string[];
  postId: string | null;
  onClose: () => void;
  calculateReadingTime: (content: string) => number;
}

export default function PublishModal({
  title,
  content,
  tags,
  postId,
  onClose,
  calculateReadingTime,
}: Props) {
  const [description, setDescription] = useState('');
  const [slug, setSlug] = useState('');
  const [heroImage, setHeroImage] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // slug 자동 생성 (한글 포함 가능)
  useEffect(() => {
    if (!slug && title) {
      const generatedSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '')  // 영문/숫자/한글 허용
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
        .substring(0, 50);
      setSlug(generatedSlug);
    }
  }, [title, slug]);

  // 썸네일 업로드
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp' as const,
      };
      const compressedFile = await imageCompression(file, options);
      const timestamp = Date.now();
      const fileName = `hero-${timestamp}.webp`;
      const storageRef = ref(storage, `images/heroes/${fileName}`);

      await uploadBytes(storageRef, compressedFile);
      const downloadURL = await getDownloadURL(storageRef);
      setHeroImage(downloadURL);
    } catch (error) {
      console.error('이미지 업로드 오류:', error);
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // 썸네일 제거
  const handleRemoveImage = () => {
    setHeroImage('');
  };

  // 출간하기
  const handlePublish = async () => {
    if (!title) {
      alert('제목을 입력해주세요.');
      return;
    }
    if (!slug) {
      alert('URL을 입력해주세요.');
      return;
    }

    setIsPublishing(true);
    try {
      // description이 비어있으면 본문에서 자동 생성
      const autoDescription = description || content
        .substring(0, 150)
        .replace(/[#*`>\-\[\]]/g, '')  // 마크다운 문법 제거
        .replace(/\n+/g, ' ')           // 줄바꿈을 공백으로
        .trim();

      const postData = {
        title,
        description: autoDescription,
        content,
        heroImage,
        tags,
        slug,
        status: 'published' as const,
        updatedDate: Timestamp.now(),
        pubDate: Timestamp.now(),
        readingTime: calculateReadingTime(content),
        isPublic,
      };

      if (postId) {
        await updateDoc(doc(db, 'posts', postId), postData);
      } else {
        await addDoc(collection(db, 'posts'), {
          ...postData,
          createdAt: Timestamp.now(),
        });
      }

      window.location.href = '/admin/posts';
    } catch (error) {
      console.error('출간 오류:', error);
      alert('출간에 실패했습니다.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-4xl gap-8 rounded-2xl bg-white p-8 dark:bg-[#1e1e1e]">
        {/* 좌측: 미리보기 */}
        <div className="flex-1">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            포스트 미리보기
          </h3>
          <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            {/* 썸네일 미리보기 */}
            <div className="aspect-video bg-gray-100 dark:bg-gray-800">
              {heroImage ? (
                <div className="relative h-full">
                  <img src={heroImage} alt="썸네일" className="h-full w-full object-cover" />
                  <div className="absolute right-2 top-2 flex gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="rounded-lg bg-white/90 px-3 py-1 text-sm text-gray-700 hover:bg-white"
                    >
                      재업로드
                    </button>
                    <button
                      onClick={handleRemoveImage}
                      className="rounded-lg bg-white/90 px-3 py-1 text-sm text-red-500 hover:bg-white"
                    >
                      제거
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-500 hover:text-brand"
                >
                  {isUploading ? (
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                  ) : (
                    <>
                      <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm">썸네일 업로드</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />

            {/* 포스트 정보 미리보기 */}
            <div className="p-4">
              <h4 className="font-semibold text-gray-900 dark:text-white">
                {title || '제목을 입력하세요'}
              </h4>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {description || content.substring(0, 150).replace(/[#*`]/g, '') + '...'}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                {description.length}/150
              </p>
            </div>
          </div>
        </div>

        {/* 우측: 설정 */}
        <div className="w-72 space-y-6">
          {/* 공개 설정 */}
          <div>
            <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
              공개 설정
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setIsPublic(true)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 font-medium transition-colors ${
                  isPublic
                    ? 'border-brand bg-brand/5 text-brand'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                전체 공개
              </button>
              <button
                onClick={() => setIsPublic(false)}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 font-medium transition-colors ${
                  !isPublic
                    ? 'border-brand bg-brand/5 text-brand'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:text-gray-400'
                }`}
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                비공개
              </button>
            </div>
          </div>

          {/* URL 설정 */}
          <div>
            <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
              URL 설정
            </h3>
            <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
              <span className="text-sm text-gray-500">/blog/</span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9가-힣-]/g, ''))}
                placeholder="포스트-제목"
                className="flex-1 bg-transparent text-sm text-gray-900 focus:outline-none dark:text-white"
              />
            </div>
          </div>

          {/* 설명 */}
          <div>
            <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
              포스트 설명
            </h3>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value.substring(0, 150))}
              placeholder="포스트를 짧게 소개해보세요"
              rows={4}
              className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          {/* 버튼 */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-gray-200 px-4 py-3 font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              취소
            </button>
            <button
              onClick={handlePublish}
              disabled={isPublishing}
              className="flex-1 rounded-xl bg-brand px-4 py-3 font-medium text-white hover:brightness-110 disabled:opacity-50"
            >
              {isPublishing ? '출간 중...' : '출간하기'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
