import { useEffect, useMemo, useState } from 'react';
import { getStoredEditorDrafts, isCreateModeDraftKey } from '@/lib/editor-drafts';
import { getClientAuth } from '@/lib/firebase-auth-client';
import {
  clearLastPublishFeedback,
  readLastPublishFeedback,
  type PublishFeedback,
} from '@/lib/publish-feedback';
import AdminGuard from './AdminGuard';
import AdminLayout from './AdminLayout';

interface Post {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published';
  source: 'local-draft' | 'published';
  tags: string[];
  slug: string;
  createdAt: string | Date;
  updatedDate: string | Date;
  readingTime?: number;
  pubDate: string | Date;
  draftKey?: string;
}

type FilterStatus = 'all' | 'published' | 'draft';

interface Props {
  initialPosts: Post[];
}

function readLocalDraftPosts(storage: Storage): Post[] {
  return getStoredEditorDrafts(storage).map((draft) => ({
    id: draft.id,
    draftKey: draft.draftKey,
    title: draft.title,
    description: draft.description,
    status: 'draft' as const,
    source: 'local-draft' as const,
    tags: draft.tags,
    slug: draft.slug,
    createdAt: draft.updatedDate,
    updatedDate: draft.updatedDate,
    readingTime: draft.readingTime,
    pubDate: draft.updatedDate,
  }));
}

export default function PostList({ initialPosts }: Props) {
  const [publishedPosts, setPublishedPosts] = useState(
    initialPosts.map((post) => ({
      ...post,
      source: 'published' as const,
      createdAt: post.createdAt instanceof Date ? post.createdAt : new Date(post.createdAt),
      updatedDate: post.updatedDate instanceof Date ? post.updatedDate : new Date(post.updatedDate),
      pubDate: post.pubDate instanceof Date ? post.pubDate : new Date(post.pubDate),
    }))
  );
  const [draftPosts, setDraftPosts] = useState<Post[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<Post | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [lastPublishFeedback, setLastPublishFeedback] = useState<PublishFeedback | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncDraftPosts = () => {
      setDraftPosts(readLocalDraftPosts(window.localStorage));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncDraftPosts();
      }
    };

    syncDraftPosts();
    window.addEventListener('storage', syncDraftPosts);
    window.addEventListener('focus', syncDraftPosts);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('storage', syncDraftPosts);
      window.removeEventListener('focus', syncDraftPosts);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const feedback = readLastPublishFeedback(window.sessionStorage);
    if (!feedback) return;
    setLastPublishFeedback(feedback);
  }, []);

  const draftSlugSet = useMemo(
    () => new Set(draftPosts.map((post) => post.slug).filter(Boolean)),
    [draftPosts]
  );

  const posts = useMemo(
    () =>
      [...draftPosts, ...publishedPosts].sort(
        (a, b) => b.updatedDate.getTime() - a.updatedDate.getTime()
      ),
    [draftPosts, publishedPosts]
  );

  const filteredPosts = useMemo(() => {
    let result = posts;

    if (filterStatus !== 'all') {
      result = result.filter((post) => post.status === filterStatus);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (post) =>
          post.title.toLowerCase().includes(term) ||
          post.description.toLowerCase().includes(term) ||
          post.tags.some((tag) => tag.toLowerCase().includes(term))
      );
    }

    return result;
  }, [posts, searchTerm, filterStatus]);

  const handleDelete = async (post: (typeof posts)[number]) => {
    setIsDeleting(true);
    try {
      if (post.source === 'local-draft') {
        if (post.draftKey) {
          window.localStorage.removeItem(post.draftKey);
        }

        setDraftPosts((current) => current.filter((item) => item.id !== post.id));
        setDeleteConfirm(null);
        return;
      }

      const token = await getClientAuth().currentUser?.getIdToken();
      if (!token) {
        throw new Error('로그인 정보를 확인할 수 없습니다.');
      }

      const response = await fetch('/api/admin/delete-post', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          slug: post.slug,
          pubDate: post.pubDate,
          title: post.title,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || '삭제에 실패했습니다.');
      }

      setPublishedPosts((current) => current.filter((item) => item.slug !== post.slug));
      setDeleteConfirm(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : '삭제에 실패했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AdminGuard>
      <AdminLayout currentPath="/admin/posts">
        <div className="space-y-6">
          {lastPublishFeedback && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Publish Complete
                  </p>
                  <h2 className="mt-2 text-xl font-semibold text-emerald-950">
                    {lastPublishFeedback.title} 출간이 끝났습니다.
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-emerald-900/80">
                    GitHub markdown 파일은 갱신됐습니다. 공개 페이지 반영은 배포 타이밍에 따라 조금 늦을 수 있으니 아래 링크로 순서대로 확인하면 됩니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    clearLastPublishFeedback(window.sessionStorage);
                    setLastPublishFeedback(null);
                  }}
                  className="rounded-xl border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  닫기
                </button>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
                <div className="space-y-3 rounded-2xl border border-emerald-200 bg-white/80 p-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                      확인 링크
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <a
                        href={lastPublishFeedback.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:brightness-110"
                      >
                        공개 페이지 보기
                      </a>
                      <a
                        href={lastPublishFeedback.githubFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
                      >
                        GitHub 파일 보기
                      </a>
                      {lastPublishFeedback.githubCommitUrl && (
                        <a
                          href={lastPublishFeedback.githubCommitUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-xl border border-emerald-200 px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-50"
                        >
                          최신 커밋 보기
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                        파일 경로
                      </p>
                      <p className="mt-2 break-all text-sm text-emerald-950">
                        {lastPublishFeedback.filePath}
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                        커밋 SHA
                      </p>
                      <p className="mt-2 break-all text-sm text-emerald-950">
                        {lastPublishFeedback.githubCommitSha || '응답 없음'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-white/80 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    운영 확인 순서
                  </p>
                  <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-emerald-950">
                    <li>GitHub 파일 링크에서 markdown 내용이 맞는지 먼저 본다.</li>
                    <li>커밋 링크가 있으면 main 브랜치에 반영됐는지 확인한다.</li>
                    <li>공개 페이지 링크로 들어가 실제 렌더링이 맞는지 본다.</li>
                    <li>반영이 늦으면 잠시 뒤 새로고침해서 배포 지연 여부만 한 번 더 본다.</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-text-primary">포스트 관리</h1>
              <p className="mt-1 text-text-secondary">
                발행 {publishedPosts.length}개, 로컬 초안 {draftPosts.length}개
              </p>
            </div>
            <a
              href="/admin/posts/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-all hover:brightness-110"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              새 포스트
            </a>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="제목, 설명, 태그로 검색..."
                className="w-full rounded-xl border border-border bg-bg-surface py-3 pl-10 pr-4 focus:border-brand focus:outline-none"
              />
            </div>

            <div className="flex gap-2">
              {(['all', 'published', 'draft'] as FilterStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`rounded-xl px-4 py-3 font-medium transition-colors ${
                    filterStatus === status
                      ? 'bg-brand text-white'
                      : 'border border-border text-text-secondary hover:border-brand hover:text-brand'
                  }`}
                >
                  {status === 'all' ? '전체' : status === 'published' ? '발행됨' : '초안'}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-bg-surface">
            {filteredPosts.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-text-secondary">
                  {searchTerm || filterStatus !== 'all' ? '검색 결과가 없습니다.' : '아직 포스트가 없습니다.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredPosts.map((post) => (
                  <div
                    key={post.id}
                    className="flex items-center justify-between p-6 transition-colors hover:bg-bg-hover"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            post.status === 'published' ? 'bg-green-500' : 'bg-yellow-500'
                          }`}
                        />
                        <a
                          href={
                            post.source === 'local-draft'
                              ? isCreateModeDraftKey(post.draftKey || post.id)
                                ? `/admin/posts/new?draft=${encodeURIComponent(post.draftKey || post.id)}`
                                : `/admin/edit?slug=${encodeURIComponent(post.slug)}`
                              : `/admin/edit?slug=${encodeURIComponent(post.slug)}`
                          }
                          className="text-lg font-semibold text-text-primary hover:text-brand"
                        >
                          {post.title}
                        </a>
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                            post.source === 'local-draft'
                              ? 'bg-yellow-500/10 text-yellow-600'
                              : 'bg-green-500/10 text-green-600'
                          }`}
                        >
                          {post.source === 'local-draft' ? '로컬 초안' : '발행됨'}
                        </span>
                        {post.source === 'published' && draftSlugSet.has(post.slug) && (
                          <span className="rounded-md bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                            로컬 초안 있음
                          </span>
                        )}
                      </div>
                      {post.description && (
                        <p className="mt-1 line-clamp-1 text-sm text-text-secondary">{post.description}</p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                            {tag}
                          </span>
                        ))}
                        {post.tags.length > 3 && (
                          <span className="text-xs text-text-secondary">+{post.tags.length - 3}</span>
                        )}
                        <span className="text-xs text-text-secondary">
                          {post.updatedDate.toLocaleDateString('ko-KR')}
                        </span>
                        {post.readingTime && (
                          <span className="text-xs text-text-secondary">· {post.readingTime}분 읽기</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {post.source === 'published' && (
                        <a
                          href={`/blog/${post.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg hover:text-text-primary"
                          title="보기"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm6 0s-3-7-9-7-9 7-9 7 3 7 9 7 9-7 9-7z"
                            />
                          </svg>
                        </a>
                      )}
                      <button
                        onClick={() => setDeleteConfirm(post)}
                        className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-500"
                        title="삭제"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22m-5-3V3a1 1 0 00-1-1H8a1 1 0 00-1 1v1"
                          />
                        </svg>
                      </button>
                    </div>

                    {deleteConfirm?.id === post.id && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
                        <div className="w-full max-w-md rounded-2xl bg-white p-6">
                          <h3 className="text-lg font-semibold text-gray-900">
                            {post.source === 'local-draft' ? '로컬 초안 삭제' : '포스트 삭제'}
                          </h3>
                          <p className="mt-2 text-sm text-gray-600">
                            <strong>{post.title}</strong> 포스트를 삭제하시겠습니까?
                          </p>
                          {post.source === 'published' ? (
                            <p className="mt-1 text-sm text-red-500">
                              이 작업은 GitHub 저장소의 markdown 파일을 삭제합니다.
                            </p>
                          ) : (
                            <p className="mt-1 text-sm text-red-500">
                              이 작업은 브라우저에 저장된 로컬 초안만 삭제합니다.
                            </p>
                          )}
                          <div className="mt-6 flex gap-3">
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="flex-1 rounded-xl border border-gray-200 px-4 py-3 font-medium text-gray-600 hover:bg-gray-50"
                            >
                              취소
                            </button>
                            <button
                              onClick={() => handleDelete(post)}
                              disabled={isDeleting}
                              className="flex-1 rounded-xl bg-red-500 px-4 py-3 font-medium text-white hover:brightness-110 disabled:opacity-50"
                            >
                              {isDeleting ? '삭제 중...' : '삭제하기'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
