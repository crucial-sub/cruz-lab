import { useEffect, useMemo, useState } from 'react';
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

const DRAFT_KEY_PREFIX = 'cruz-lab-editor-draft:';

export default function AdminDashboard({ publishedPosts }: Props) {
  const [draftCount, setDraftCount] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const draftKeys = Object.keys(window.localStorage).filter((key) => key.startsWith(DRAFT_KEY_PREFIX));
    setDraftCount(draftKeys.length);
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
