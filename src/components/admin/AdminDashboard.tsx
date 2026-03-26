import { useEffect, useMemo, useState } from 'react';
import { DRAFT_KEY_PREFIX, getStoredEditorDrafts } from '@/lib/editor-drafts';
import { getClientAuth } from '@/lib/firebase-auth-client';
import type { PublishStatusPayload } from '@/lib/publish-status';
import AdminGuard from './AdminGuard';
import AdminLayout from './AdminLayout';

interface PublishedPost {
  id: string;
  title: string;
  slug: string;
  updatedDate: string | Date;
}

interface Props {
  publishedPosts: PublishedPost[];
}

export default function AdminDashboard({ publishedPosts }: Props) {
  const [draftCount, setDraftCount] = useState(0);
  const [publishStatus, setPublishStatus] = useState<PublishStatusPayload | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const draftKeys = Object.keys(window.localStorage).filter((key) => key.startsWith(DRAFT_KEY_PREFIX));
    if (draftKeys.length === 0) {
      setDraftCount(0);
      return;
    }

    setDraftCount(getStoredEditorDrafts(window.localStorage).length);
  }, []);

  useEffect(() => {
    let active = true;

    const loadPublishStatus = async () => {
      try {
        setStatusError(null);
        const idToken = await getClientAuth().currentUser?.getIdToken();
        if (!idToken) {
          throw new Error('관리자 인증 정보를 확인할 수 없습니다.');
        }

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
      }
    };

    loadPublishStatus();

    return () => {
      active = false;
    };
  }, []);

  const recentPosts = useMemo(
    () =>
      publishedPosts
        .map((post) => ({
          ...post,
          updatedDate: post.updatedDate instanceof Date ? post.updatedDate : new Date(post.updatedDate),
        }))
        .sort((a, b) => b.updatedDate.getTime() - a.updatedDate.getTime())
        .slice(0, 5),
    [publishedPosts]
  );

  const stats = {
    publishedCount: publishedPosts.length,
    draftCount,
    totalCount: publishedPosts.length + draftCount,
  };

  return (
    <AdminGuard>
      <AdminLayout currentPath="/admin">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">대시보드</h1>
            <p className="mt-1 text-text-secondary">
              발행된 markdown 포스트와 로컬 임시저장 상태를 한눈에 확인합니다.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-bg-surface p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
                  <svg className="h-6 w-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-text-secondary">전체 포스트</p>
                  <p className="text-2xl font-bold text-text-primary">{stats.totalCount}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg-surface p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                  <svg className="h-6 w-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-text-secondary">발행됨</p>
                  <p className="text-2xl font-bold text-text-primary">{stats.publishedCount}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-bg-surface p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-500/10">
                  <svg className="h-6 w-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-text-secondary">로컬 초안</p>
                  <p className="text-2xl font-bold text-text-primary">{stats.draftCount}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <a
              href="/admin/posts/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-all hover:scale-[1.02] hover:brightness-110"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              새 포스트 작성
            </a>
            <a
              href="/admin/posts"
              className="inline-flex items-center gap-2 rounded-xl border border-border px-6 py-3 font-semibold text-text-primary transition-colors hover:border-brand hover:text-brand"
            >
              포스트 관리
            </a>
          </div>

          <div className="rounded-2xl border border-border bg-bg-surface p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">출간 시스템 상태</h2>
                <p className="mt-1 text-sm text-text-secondary">
                  GitHub 반영에 필요한 서버 설정과 대상 저장소 정보를 여기서 먼저 확인합니다.
                </p>
              </div>
              <a
                href="/admin/posts/new"
                className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:border-brand hover:text-brand"
              >
                새 포스트로 이동
              </a>
            </div>

            {statusError ? (
              <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
                {statusError}
              </p>
            ) : !publishStatus ? (
              <p className="mt-4 rounded-xl bg-bg px-4 py-3 text-sm text-text-secondary">
                서버 준비 상태를 확인하는 중입니다...
              </p>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                <div className="space-y-3">
                  <div
                    className={`rounded-xl px-4 py-3 text-sm font-medium ${
                      publishStatus.ready
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {publishStatus.ready
                      ? '현재 서버 설정으로 출간을 진행할 수 있습니다.'
                      : '출간 전 확인이 필요한 서버 설정이 있습니다.'}
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    {publishStatus.checks.map((check) => (
                      <div key={check.id} className="rounded-xl border border-border bg-bg p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-text-primary">{check.label}</p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              check.ready
                                ? 'bg-emerald-500/10 text-emerald-600'
                                : 'bg-amber-500/10 text-amber-600'
                            }`}
                          >
                            {check.kind === 'active'
                              ? check.ready
                                ? '실시간 확인'
                                : '실시간 실패'
                              : check.ready
                                ? '정상'
                                : '확인 필요'}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-text-secondary">{check.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                  <div className="rounded-xl border border-border bg-bg p-4">
                    <p className="text-sm font-semibold text-text-primary">출간 대상</p>
                    <div className="mt-3 space-y-2 text-sm text-text-secondary">
                      <p>저장소 · {publishStatus.target.repository}</p>
                      <p>브랜치 · {publishStatus.target.branch}</p>
                      <p>포스트 경로 · {publishStatus.target.postsPath}</p>
                      <p>공개 사이트 · {publishStatus.target.siteUrl}</p>
                      {publishStatus.target.currentOrigin !== publishStatus.target.siteUrl && (
                        <p>현재 접속 origin · {publishStatus.target.currentOrigin}</p>
                      )}
                      <p>마지막 확인 · {new Date(publishStatus.verifiedAt).toLocaleString('ko-KR')}</p>
                    </div>
                  </div>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-bg-surface">
            <div className="border-b border-border p-6">
              <h2 className="text-lg font-semibold text-text-primary">최근 발행 포스트</h2>
            </div>
            <div className="p-6">
              {recentPosts.length === 0 ? (
                <p className="py-8 text-center text-text-secondary">아직 발행된 포스트가 없습니다.</p>
              ) : (
                <ul className="space-y-4">
                  {recentPosts.map((post) => (
                    <li key={post.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        <a
                          href={`/admin/edit?slug=${encodeURIComponent(post.slug)}`}
                          className="font-medium text-text-primary hover:text-brand"
                        >
                          {post.title}
                        </a>
                      </div>
                      <span className="text-sm text-text-secondary">
                        {post.updatedDate.toLocaleDateString('ko-KR')}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
