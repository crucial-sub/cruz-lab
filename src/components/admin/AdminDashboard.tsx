import { useEffect, useMemo, useState } from 'react';
import { DRAFT_KEY_PREFIX, getStoredEditorDrafts } from '@/lib/editor-drafts';
import { getClientAdminIdToken } from '@/lib/firebase-auth-client';
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

function getPublishCheckBadge(check: PublishStatusPayload['checks'][number]) {
  if (check.kind === 'active') {
    return check.ready ? '실시간 확인' : '실시간 실패';
  }

  return check.ready ? '정상' : '확인 필요';
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

          <div className="flex flex-wrap gap-4">
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
              <div className="mt-5 space-y-4">
                <div
                  className={`rounded-2xl border px-4 py-4 text-sm font-medium ${
                    publishStatus.ready
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  {publishStatus.ready
                    ? '현재 서버 설정으로 출간을 진행할 수 있습니다.'
                    : '출간 전에 확인이 필요한 항목이 있습니다.'}
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
                  <div className="rounded-3xl border border-border bg-bg p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
                          Status Checks
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-text-primary">상태 체크</h3>
                      </div>
                      <span className="rounded-full border border-border bg-bg-surface px-3 py-1 text-xs font-semibold text-text-secondary">
                        {publishStatus.checks.length}개 항목
                      </span>
                    </div>

                    <ul className="mt-5 space-y-3">
                      {publishStatus.checks.map((check) => (
                        <li
                          key={check.id}
                          className={`rounded-2xl border px-4 py-4 ${
                            check.ready
                              ? 'border-emerald-500/20 bg-emerald-500/5'
                              : 'border-amber-500/20 bg-amber-500/5'
                          }`}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text-primary">{check.label}</p>
                              <p className="mt-2 text-sm leading-6 text-text-secondary">{check.detail}</p>
                            </div>
                            <span
                              className={`shrink-0 self-start whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                                check.ready
                                  ? 'bg-emerald-500/15 text-emerald-600'
                                  : 'bg-amber-500/15 text-amber-600'
                              }`}
                            >
                              {getPublishCheckBadge(check)}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rounded-3xl border border-border bg-gradient-to-b from-bg to-bg-surface p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
                          Publish Target
                        </p>
                        <h3 className="mt-2 text-lg font-semibold text-text-primary">출간 대상</h3>
                        <p className="mt-1 text-sm leading-6 text-text-secondary">
                          현재 관리자 화면이 실제로 갱신하는 위치를 한 번에 보여줍니다.
                        </p>
                      </div>
                      <span className="rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                        {publishStatus.ready ? 'Ready' : 'Check'}
                      </span>
                    </div>

                    <dl className="mt-5 space-y-3">
                      <div className="rounded-2xl border border-border bg-bg p-4">
                        <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">저장소</dt>
                        <dd className="mt-2 break-all text-sm font-medium text-text-primary">
                          {publishStatus.target.repository}
                        </dd>
                      </div>
                      <div className="rounded-2xl border border-border bg-bg p-4">
                        <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">브랜치</dt>
                        <dd className="mt-2 text-sm font-medium text-text-primary">{publishStatus.target.branch}</dd>
                      </div>
                      <div className="rounded-2xl border border-border bg-bg p-4">
                        <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">포스트 경로</dt>
                        <dd className="mt-2 break-all text-sm font-medium text-text-primary">
                          {publishStatus.target.postsPath}
                        </dd>
                      </div>
                      <div className="rounded-2xl border border-border bg-bg p-4">
                        <dt className="text-xs font-semibold uppercase tracking-[0.16em] text-text-secondary">공개 사이트</dt>
                        <dd className="mt-2 break-all text-sm font-medium text-text-primary">
                          {publishStatus.target.siteUrl}
                        </dd>
                        {publishStatus.target.currentOrigin !== publishStatus.target.siteUrl && (
                          <p className="mt-3 text-xs leading-5 text-text-secondary">
                            현재 접속 origin · {publishStatus.target.currentOrigin}
                          </p>
                        )}
                      </div>
                      <div className="rounded-2xl border border-dashed border-border bg-bg p-4 text-xs leading-6 text-text-secondary">
                        마지막 확인 · {new Date(publishStatus.verifiedAt).toLocaleString('ko-KR')}
                      </div>
                    </dl>
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
