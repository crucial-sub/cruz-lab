// 관리자 대시보드 컴포넌트
// 포스트 통계 및 빠른 작업 버튼 제공
import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, initializeFirebase } from '@/lib/firebase';
import AdminGuard from './AdminGuard';
import AdminLayout from './AdminLayout';

interface Stats {
  publishedCount: number;
  draftCount: number;
  totalCount: number;
}

interface RecentPost {
  id: string;
  title: string;
  status: 'draft' | 'published';
  updatedDate: Date;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({
    publishedCount: 0,
    draftCount: 0,
    totalCount: 0,
  });
  const [recentPosts, setRecentPosts] = useState<RecentPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        initializeFirebase();

        const postsRef = collection(db, 'posts');

        // 발행된 포스트 수
        const publishedQuery = query(postsRef, where('status', '==', 'published'));
        const publishedSnap = await getDocs(publishedQuery);

        // 초안 수
        const draftQuery = query(postsRef, where('status', '==', 'draft'));
        const draftSnap = await getDocs(draftQuery);

        // 최근 포스트 5개
        const recentQuery = query(
          postsRef,
          orderBy('updatedDate', 'desc'),
          limit(5)
        );
        const recentSnap = await getDocs(recentQuery);

        const recentPostsData = recentSnap.docs.map(doc => ({
          id: doc.id,
          title: doc.data().title || '제목 없음',
          status: doc.data().status as 'draft' | 'published',
          updatedDate: doc.data().updatedDate?.toDate() || new Date(),
        }));

        setStats({
          publishedCount: publishedSnap.size,
          draftCount: draftSnap.size,
          totalCount: publishedSnap.size + draftSnap.size,
        });
        setRecentPosts(recentPostsData);
      } catch (error) {
        console.error('데이터 로딩 오류:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, []);

  return (
    <AdminGuard>
      <AdminLayout currentPath="/admin">
        <div className="space-y-8">
          {/* 페이지 헤더 */}
          <div>
            <h1 className="text-3xl font-bold text-text-primary">대시보드</h1>
            <p className="mt-1 text-text-secondary">블로그 현황을 한눈에 확인하세요.</p>
          </div>

          {/* 통계 카드 */}
          <div className="grid gap-6 md:grid-cols-3">
            {/* 전체 포스트 */}
            <div className="rounded-2xl border border-border bg-bg-surface p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand/10">
                  <svg className="h-6 w-6 text-brand" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-text-secondary">전체 포스트</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {isLoading ? '-' : stats.totalCount}
                  </p>
                </div>
              </div>
            </div>

            {/* 발행됨 */}
            <div className="rounded-2xl border border-border bg-bg-surface p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/10">
                  <svg className="h-6 w-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-text-secondary">발행됨</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {isLoading ? '-' : stats.publishedCount}
                  </p>
                </div>
              </div>
            </div>

            {/* 초안 */}
            <div className="rounded-2xl border border-border bg-bg-surface p-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-yellow-500/10">
                  <svg className="h-6 w-6 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-text-secondary">초안</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {isLoading ? '-' : stats.draftCount}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 빠른 작업 */}
          <div className="flex gap-4">
            <a
              href="/admin/posts/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-all hover:brightness-110 hover:scale-[1.02]"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4v16m8-8H4" />
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

          {/* 최근 포스트 */}
          <div className="rounded-2xl border border-border bg-bg-surface">
            <div className="border-b border-border p-6">
              <h2 className="text-lg font-semibold text-text-primary">최근 포스트</h2>
            </div>
            <div className="p-6">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
                </div>
              ) : recentPosts.length === 0 ? (
                <p className="py-8 text-center text-text-secondary">
                  아직 작성된 포스트가 없습니다.
                </p>
              ) : (
                <ul className="space-y-4">
                  {recentPosts.map((post) => (
                    <li key={post.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            post.status === 'published' ? 'bg-green-500' : 'bg-yellow-500'
                          }`}
                        />
                        <a
                          href={`/admin/edit?id=${post.id}`}
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
