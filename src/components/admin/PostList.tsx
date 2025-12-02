// 포스트 목록 관리 컴포넌트
// 포스트 검색, 필터링, 삭제 기능 제공
import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, deleteDoc, doc, where } from 'firebase/firestore';
import { db, initializeFirebase } from '@/lib/firebase';
import AdminGuard from './AdminGuard';
import AdminLayout from './AdminLayout';

interface Post {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'published';
  tags: string[];
  slug: string;
  createdAt: Date;
  updatedDate: Date;
  readingTime?: number;
}

type FilterStatus = 'all' | 'published' | 'draft';

export default function PostList() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 포스트 목록 불러오기
  useEffect(() => {
    async function fetchPosts() {
      try {
        initializeFirebase();
        const postsRef = collection(db, 'posts');
        const q = query(postsRef, orderBy('updatedDate', 'desc'));
        const snapshot = await getDocs(q);

        const postsData = snapshot.docs.map((doc) => ({
          id: doc.id,
          title: doc.data().title || '제목 없음',
          description: doc.data().description || '',
          status: doc.data().status as 'draft' | 'published',
          tags: doc.data().tags || [],
          slug: doc.data().slug || '',
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedDate: doc.data().updatedDate?.toDate() || new Date(),
          readingTime: doc.data().readingTime || 0,
        }));

        setPosts(postsData);
        setFilteredPosts(postsData);
      } catch (error) {
        console.error('포스트 로딩 오류:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchPosts();
  }, []);

  // 검색 및 필터링
  useEffect(() => {
    let result = posts;

    // 상태 필터
    if (filterStatus !== 'all') {
      result = result.filter((post) => post.status === filterStatus);
    }

    // 검색어 필터
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (post) =>
          post.title.toLowerCase().includes(term) ||
          post.description.toLowerCase().includes(term) ||
          post.tags.some((tag) => tag.toLowerCase().includes(term))
      );
    }

    setFilteredPosts(result);
  }, [posts, searchTerm, filterStatus]);

  // 포스트 삭제
  const handleDelete = async (postId: string) => {
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'posts', postId));
      setPosts(posts.filter((post) => post.id !== postId));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('삭제 오류:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AdminGuard>
      <AdminLayout currentPath="/admin/posts">
        <div className="space-y-6">
          {/* 페이지 헤더 */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-text-primary">포스트 관리</h1>
              <p className="mt-1 text-text-secondary">
                총 {posts.length}개의 포스트
              </p>
            </div>
            <a
              href="/admin/posts/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-all hover:brightness-110"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4v16m8-8H4" />
              </svg>
              새 포스트
            </a>
          </div>

          {/* 검색 및 필터 */}
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* 검색 */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="제목, 설명, 태그로 검색..."
                className="w-full rounded-xl border border-border bg-bg-surface py-3 pl-10 pr-4 focus:border-brand focus:outline-none"
              />
            </div>

            {/* 상태 필터 */}
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

          {/* 포스트 목록 */}
          <div className="rounded-2xl border border-border bg-bg-surface">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="py-20 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-text-secondary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="mt-4 text-text-secondary">
                  {searchTerm || filterStatus !== 'all'
                    ? '검색 결과가 없습니다.'
                    : '아직 포스트가 없습니다.'}
                </p>
                {!searchTerm && filterStatus === 'all' && (
                  <a
                    href="/admin/posts/new"
                    className="mt-4 inline-flex items-center gap-2 text-brand hover:underline"
                  >
                    첫 번째 포스트 작성하기
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                )}
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
                          href={`/admin/edit?id=${post.id}`}
                          className="text-lg font-semibold text-text-primary hover:text-brand"
                        >
                          {post.title}
                        </a>
                      </div>
                      {post.description && (
                        <p className="mt-1 line-clamp-1 text-sm text-text-secondary">
                          {post.description}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {post.tags.slice(0, 3).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand"
                          >
                            {tag}
                          </span>
                        ))}
                        {post.tags.length > 3 && (
                          <span className="text-xs text-text-secondary">
                            +{post.tags.length - 3}
                          </span>
                        )}
                        <span className="text-xs text-text-secondary">
                          {post.updatedDate.toLocaleDateString('ko-KR')}
                        </span>
                        {post.readingTime && (
                          <span className="text-xs text-text-secondary">
                            · {post.readingTime}분 읽기
                          </span>
                        )}
                      </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex items-center gap-2">
                      {post.status === 'published' && (
                        <a
                          href={`/blog/${post.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg hover:text-text-primary"
                          title="보기"
                        >
                          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </a>
                      )}
                      <a
                        href={`/admin/edit?id=${post.id}`}
                        className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg hover:text-text-primary"
                        title="수정"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </a>
                      <button
                        onClick={() => setDeleteConfirm(post.id)}
                        className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-red-500/10 hover:text-red-500"
                        title="삭제"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 삭제 확인 모달 */}
          {deleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
              <div className="mx-4 w-full max-w-md rounded-2xl bg-bg-surface p-6">
                <h3 className="text-lg font-semibold text-text-primary">
                  포스트를 삭제하시겠습니까?
                </h3>
                <p className="mt-2 text-text-secondary">
                  이 작업은 되돌릴 수 없습니다. 포스트와 관련된 모든 데이터가 삭제됩니다.
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    disabled={isDeleting}
                    className="rounded-xl border border-border px-4 py-2 font-medium text-text-secondary transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => handleDelete(deleteConfirm)}
                    disabled={isDeleting}
                    className="rounded-xl bg-red-500 px-4 py-2 font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
                  >
                    {isDeleting ? '삭제 중...' : '삭제'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
