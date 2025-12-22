// 시리즈 목록 관리 컴포넌트
import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, deleteDoc, doc, writeBatch, where } from 'firebase/firestore';
import { db, initializeFirebase } from '@/lib/firebase';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import type { Series } from '@/lib/series';

export default function SeriesList() {
  const [seriesList, setSeriesList] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 시리즈 목록 불러오기
  useEffect(() => {
    async function fetchSeries() {
      try {
        initializeFirebase();
        const seriesRef = collection(db, 'series');
        const q = query(seriesRef, orderBy('order', 'asc'));
        const snapshot = await getDocs(q);

        const seriesData = snapshot.docs.map((doc) => {
            const data = doc.data();
            return {
                id: doc.id,
                name: data.name || '',
                slug: data.slug || doc.id,
                description: data.description || '',
                coverImage: data.coverImage || undefined,
                postIds: data.postIds || [],
                postCount: data.postCount || 0,
                createdAt: data.createdAt?.toDate() || new Date(),
                updatedAt: data.updatedAt?.toDate() || new Date(),
                isPublic: data.isPublic ?? false,
                order: data.order ?? 999,
            };
        });

        setSeriesList(seriesData);
      } catch (error) {
        console.error('시리즈 로딩 오류:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchSeries();
  }, []);

  // 시리즈 삭제
  const handleDelete = async (seriesId: string) => {
    setIsDeleting(true);
    try {
      // 1. 시리즈에 속한 포스트들의 연결 해제
      const postsRef = collection(db, 'posts');
      const q = query(postsRef, where('seriesId', '==', seriesId));
      const snapshot = await getDocs(q);

      const batch = writeBatch(db);
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, {
          seriesId: null,
          seriesOrder: null
        });
      });

      // 2. 시리즈 문서 삭제
      batch.delete(doc(db, 'series', seriesId));
      
      await batch.commit();

      setSeriesList(seriesList.filter((s) => s.id !== seriesId));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('삭제 오류:', error);
      alert('삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AdminGuard>
      <AdminLayout currentPath="/admin/series">
        <div className="space-y-6">
          {/* 페이지 헤더 */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-text-primary">시리즈 관리</h1>
              <p className="mt-1 text-text-secondary">
                총 {seriesList.length}개의 시리즈
              </p>
            </div>
            <a
              href="/admin/series/new"
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-3 font-semibold text-white transition-all hover:brightness-110"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 4v16m8-8H4" />
              </svg>
              새 시리즈
            </a>
          </div>

          {/* 시리즈 목록 */}
          <div className="rounded-2xl border border-border bg-bg-surface">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
              </div>
            ) : seriesList.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-text-secondary">아직 등록된 시리즈가 없습니다.</p>
                <a
                  href="/admin/series/new"
                  className="mt-4 inline-flex items-center gap-2 text-brand hover:underline"
                >
                  첫 번째 시리즈 만들기
                </a>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {seriesList.map((series) => (
                  <div
                    key={series.id}
                    className="flex items-center justify-between p-6 transition-colors hover:bg-bg-hover"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            series.isPublic ? 'bg-green-500' : 'bg-gray-400'
                          }`}
                          title={series.isPublic ? '공개' : '비공개'}
                        />
                        <a
                          href={`/admin/series/edit?id=${series.id}`}
                          className="text-lg font-semibold text-text-primary hover:text-brand"
                        >
                          {series.name}
                        </a>
                        <span className="rounded-md bg-bg border border-border px-2 py-0.5 text-xs text-text-secondary">
                           순서: {series.order}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-1 text-sm text-text-secondary">
                        {series.description}
                      </p>
                      <div className="mt-2 flex items-center gap-4 text-xs text-text-secondary">
                        <span>포스트 {series.postCount}개</span>
                        <span>
                          수정: {series.updatedAt.toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex items-center gap-2">
                        {series.isPublic && (
                             <a
                             href={`/series/${series.slug}`}
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
                        href={`/admin/series/edit?id=${series.id}`}
                        className="rounded-lg p-2 text-text-secondary transition-colors hover:bg-bg hover:text-text-primary"
                        title="수정"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </a>
                      <button
                        onClick={() => setDeleteConfirm(series.id)}
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
                  시리즈를 삭제하시겠습니까?
                </h3>
                <p className="mt-2 text-text-secondary">
                  시리즈 문서만 삭제되며, 포함된 포스트는 삭제되지 않습니다. (포스트의 시리즈 연결이 해제됩니다)
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
