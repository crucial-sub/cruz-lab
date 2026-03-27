// 출간 설정 모달
// 최종 확인, 로컬 백업, 출간 액션
import { useEffect, useState } from 'react';
import { resolveAdminAssetPreviewUrl } from '@/lib/admin-asset-preview';
import { getClientAdminIdToken } from '@/lib/firebase-auth-client';
import { generateMarkdownContent } from '@/lib/markdown-publish';
import { saveLastPublishFeedback, type PublishFeedback } from '@/lib/publish-feedback';
import type { PublishStatusPayload } from '@/lib/publish-status';

const MARKDOWN_STRIP_PATTERN = /#|\*|`|>|\[|\]|-/g;

interface Props {
  title: string;
  content: string;
  tags: string[];
  onClose: () => void;
  calculateReadingTime: (content: string) => number;
  heroImage: string;
  description: string;
  slug: string;
  isPublic: boolean;
  pubDate?: string;
  originalSlug?: string;
  onPublished?: (result: PublishFeedback) => void;
}

export default function PublishModal({
  title,
  content,
  tags,
  onClose,
  calculateReadingTime,
  heroImage,
  description,
  slug,
  isPublic,
  pubDate = '',
  originalSlug = '',
  onPublished,
}: Props) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<PublishStatusPayload | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const heroPreviewUrl = resolveAdminAssetPreviewUrl(heroImage);

  const buildPayload = () => {
    const autoDescription =
      description ||
      content
        .substring(0, 150)
        .replace(MARKDOWN_STRIP_PATTERN, '')
        .replace(/\n+/g, ' ')
        .trim();

    return {
      title,
      description: autoDescription,
      content,
      heroImage,
      tags,
      slug,
      readingTime: calculateReadingTime(content),
      isPublic,
      pubDate: pubDate || new Date().toISOString(),
      updatedDate: new Date().toISOString(),
      originalSlug,
      isUpdate: Boolean(originalSlug),
    };
  };

  const payload = buildPayload();
  const readinessItems = [
    {
      id: 'title',
      label: '제목',
      value: title || '제목 없음',
      ready: Boolean(title.trim()),
    },
    {
      id: 'slug',
      label: 'URL',
      value: slug ? `/blog/${slug}` : 'slug가 비어 있습니다.',
      ready: Boolean(slug.trim()),
    },
    {
      id: 'description',
      label: '설명',
      value: payload.description || '설명이 비어 있습니다.',
      ready: Boolean(payload.description.trim()),
    },
    {
      id: 'visibility',
      label: '공개 상태',
      value: isPublic ? '전체 공개' : '비공개',
      ready: true,
    },
    {
      id: 'thumbnail',
      label: '썸네일',
      value: heroImage ? '준비됨' : '없음',
      ready: Boolean(heroImage),
    },
  ];

  const publishWarnings = readinessItems.filter((item) => !item.ready);

  useEffect(() => {
    let active = true;

    const loadPublishStatus = async () => {
      try {
        setStatusLoading(true);
        setStatusError(null);

        const idToken = await getClientAdminIdToken();

        const response = await fetch('/api/admin/publish-status', {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || '출간 상태를 불러오지 못했습니다.');
        }

        if (!active) return;
        setPublishStatus(result);
      } catch (error) {
        if (!active) return;
        setStatusError(error instanceof Error ? error.message : '출간 상태를 불러오지 못했습니다.');
      } finally {
        if (active) {
          setStatusLoading(false);
        }
      }
    };

    loadPublishStatus();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPublishing) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isPublishing, onClose]);

  const isPublishBlocked = Boolean(statusError) || (publishStatus ? !publishStatus.ready : statusLoading);

  const handleDownloadMarkdown = () => {
    if (!title || !slug) {
      alert('제목과 URL을 먼저 확인해주세요.');
      return;
    }

    const markdown = generateMarkdownContent(payload);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}.md`;
    link.click();
    URL.revokeObjectURL(url);
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
      const idToken = await getClientAdminIdToken();

      const response = await fetch('/api/admin/publish-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(buildPayload()),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || '출간에 실패했습니다.');
      }

      const publishFeedback: PublishFeedback = {
        slug: result.slug || slug,
        title,
        filePath: result.filePath,
        publicUrl: result.publicUrl,
        githubFileUrl: result.githubFileUrl,
        githubCommitUrl: result.githubCommitUrl,
        githubCommitSha: result.githubCommitSha,
        publishedAt: new Date().toISOString(),
      };

      if (typeof window !== 'undefined') {
        saveLastPublishFeedback(window.sessionStorage, publishFeedback);
      }

      onPublished?.(publishFeedback);
      window.location.href = '/admin/posts';
    } catch (error) {
      console.error('출간 오류:', error);
      alert(error instanceof Error ? error.message : '출간에 실패했습니다.');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4">
      <button
        type="button"
        aria-label="출간 모달 닫기"
        disabled={isPublishing}
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default disabled:cursor-not-allowed"
      />
      <div className="relative z-10 flex min-h-full items-center justify-center">
        <div className="relative my-6 flex w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-[#1e1e1e] xl:max-h-[calc(100vh-3rem)] xl:flex-row">
          <button
            type="button"
            onClick={onClose}
            disabled={isPublishing}
            className="absolute right-4 top-4 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white/90 text-gray-500 shadow-sm transition hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:bg-[#242424]/90 dark:text-gray-300 dark:hover:text-white"
            aria-label="출간 모달 닫기"
          >
            ×
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
            <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
              포스트 미리보기
            </h3>
            <div className="overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700">
            {/* 썸네일 미리보기 */}
            <div className="aspect-video bg-gray-100 dark:bg-gray-800">
              {heroImage ? (
                /\.(mp4|webm|mov)/.test(heroImage) ? (
                  <video src={heroPreviewUrl} className="h-full w-full object-cover" muted autoPlay loop playsInline />
                ) : (
                  <img src={heroPreviewUrl} alt="썸네일" className="h-full w-full object-cover" />
                )
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
                  <svg className="h-12 w-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm">본문 화면에서 썸네일을 먼저 올려주세요</span>
                </div>
              )}
            </div>

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
          <aside className="flex w-full shrink-0 flex-col border-t border-gray-200 bg-gray-50/80 dark:border-gray-800 dark:bg-[#191919] xl:w-[380px] xl:border-l xl:border-t-0">
            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              <div>
                <h3 className="mb-3 text-lg font-semibold text-gray-900 dark:text-white">
                  최종 확인
                </h3>
                <div className="space-y-3 rounded-2xl border border-gray-200 bg-white/70 p-4 dark:border-gray-700 dark:bg-[#242424]">
                  {readinessItems.map((item) => (
                    <div key={item.id} className="rounded-xl bg-white px-3 py-3 dark:bg-[#1d1d1d]">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                          {item.label}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            item.ready ? 'text-emerald-600' : 'text-amber-600'
                          }`}
                        >
                          {item.ready ? '준비됨' : '확인 필요'}
                        </span>
                      </div>
                      <p className="mt-2 break-all text-sm text-gray-700 dark:text-gray-200">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 bg-white/70 p-4 dark:border-gray-700 dark:bg-[#242424]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                      메타데이터 수정
                    </h4>
                    <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                      slug, 설명, 공개 상태는 본문 화면 상단 패널에서 바로 수정할 수 있습니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-[#1d1d1d]"
                  >
                    다시 수정
                  </button>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 bg-white/70 p-4 dark:border-gray-700 dark:bg-[#242424]">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  출간 시스템 상태
                </h4>
                {statusLoading ? (
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    서버 준비 상태를 확인하는 중입니다...
                  </p>
                ) : statusError ? (
                  <p className="mt-2 text-sm text-red-500">{statusError}</p>
                ) : publishStatus ? (
                  <div className="mt-3 space-y-3">
                    <div
                      className={`rounded-xl px-3 py-3 text-sm font-medium ${
                        publishStatus.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {publishStatus.ready
                        ? '현재 서버 설정으로 출간을 진행할 수 있습니다.'
                        : '서버 설정이 완전하지 않아 출간을 막습니다. 아래 항목을 먼저 확인해주세요.'}
                    </div>
                    <div className="space-y-2">
                      {publishStatus.checks.map((check) => (
                        <div key={check.id} className="rounded-xl bg-white px-3 py-3 dark:bg-[#1d1d1d]">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
                              {check.label}
                            </span>
                            <span className={`text-xs font-medium ${check.ready ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {check.kind === 'active'
                                ? check.ready
                                  ? '실시간 확인'
                                  : '실시간 실패'
                                : check.ready
                                  ? '정상'
                                  : '확인 필요'}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-6 text-gray-700 dark:text-gray-200">
                            {check.detail}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs leading-6 text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      <p>대상 저장소 · {publishStatus.target.repository}</p>
                      <p>브랜치 · {publishStatus.target.branch}</p>
                      <p>포스트 경로 · {publishStatus.target.postsPath}</p>
                      <p>공개 사이트 · {publishStatus.target.siteUrl}</p>
                      {publishStatus.target.currentOrigin !== publishStatus.target.siteUrl && (
                        <p>현재 접속 origin · {publishStatus.target.currentOrigin}</p>
                      )}
                      <p>마지막 확인 · {new Date(publishStatus.verifiedAt).toLocaleString('ko-KR')}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 bg-white/70 p-4 dark:border-gray-700 dark:bg-[#242424]">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  출간 정보
                </h4>
                <div className="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <p>태그 · {tags.length}개</p>
                  <p>예상 읽기 시간 · {payload.readingTime}분</p>
                  <p>{originalSlug ? '기존 포스트 수정' : '새 포스트 발행'}</p>
                </div>
              </div>

              {publishWarnings.length > 0 && (
                <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">출간 전 확인이 필요한 항목이 있습니다.</p>
                  <ul className="mt-2 space-y-1">
                    {publishWarnings.map((item) => (
                      <li key={item.id}>- {item.label}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 rounded-2xl border border-gray-200 bg-white/70 p-4 dark:border-gray-700 dark:bg-[#242424]">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                  로컬 백업
                </h4>
                <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
                  최종 출간 전에 현재 상태를 markdown 파일로 내려받아 둘 수 있습니다.
                </p>
                <button
                  onClick={handleDownloadMarkdown}
                  className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3 font-medium text-gray-600 hover:bg-white dark:border-gray-700 dark:text-gray-300 dark:hover:bg-[#1d1d1d]"
                >
                  Markdown 내려받기
                </button>
              </div>
            </div>

            <div className="border-t border-gray-200 bg-white/90 p-5 dark:border-gray-800 dark:bg-[#171717]/90">
              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-gray-200 px-4 py-3 font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
                >
                  취소
                </button>
                <button
                  onClick={handlePublish}
                  disabled={isPublishing || isPublishBlocked}
                  className="flex-1 rounded-xl bg-brand px-4 py-3 font-medium text-white hover:brightness-110 disabled:opacity-50"
                >
                  {isPublishing ? '출간 중...' : isPublishBlocked ? '출간 준비 확인 필요' : '출간하기'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
