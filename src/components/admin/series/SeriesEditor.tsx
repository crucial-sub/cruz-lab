// 시리즈 에디터 컴포넌트
import { useState, useEffect } from 'react';
import { collection, query, orderBy, getDocs, doc, writeBatch, getDoc, Timestamp, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, initializeFirebase } from '@/lib/firebase';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import type { Post } from '@/lib/posts';
import type { Series } from '@/lib/series';
import imageCompression from 'browser-image-compression';

interface Props {
  seriesId?: string | null;
  mode: 'create' | 'edit';
}

interface PostItem extends Post {
  selected?: boolean;
}

export default function SeriesEditor({ seriesId, mode }: Props) {
  // 메타데이터 상태
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [order, setOrder] = useState(1);
  
  // 포스트 관리 상태
  const [allPosts, setAllPosts] = useState<PostItem[]>([]); // 전체 포스트 목록 (선택용)
  const [seriesPosts, setSeriesPosts] = useState<PostItem[]>([]); // 현재 시리즈에 포함된 포스트
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [postSearchTerm, setPostSearchTerm] = useState('');

  // UI 상태
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 초기 데이터 로딩
  useEffect(() => {
    async function initData() {
      try {
        initializeFirebase();
        setIsLoading(true);

        // 1. 전체 포스트 로딩 (선택 모달용)
        const postsRef = collection(db, 'posts');
        const postsQ = query(postsRef, orderBy('createdAt', 'desc'));
        const postsSnap = await getDocs(postsQ);
        const postsData = postsSnap.docs.map(d => ({ 
            id: d.id, 
            ...d.data(), 
            createdAt: d.data().createdAt?.toDate() 
        } as PostItem));
        setAllPosts(postsData);

        // 2. 수정 모드일 경우 시리즈 데이터 로딩
        if (mode === 'edit' && seriesId) {
          const seriesRef = doc(db, 'series', seriesId);
          const seriesSnap = await getDoc(seriesRef);
          
          if (seriesSnap.exists()) {
            const data = seriesSnap.data();
            setName(data.name || '');
            setSlug(data.slug || '');
            setDescription(data.description || '');
            setCoverImage(data.coverImage || '');
            setIsPublic(data.isPublic || false);
            setOrder(data.order || 1);

            // 시리즈에 속한 포스트 로딩 (순서대로)
            // postIds 배열이 있다면 그것을 사용하거나, posts 컬렉션에서 조회
            // 여기서는 posts 컬렉션에서 seriesId로 조회하여 정렬
            // (이미 fetch된 allPosts에서 필터링 가능하지만, 최신 상태 유지를 위해 쿼리 권장, 하지만 allPosts가 있으니 활용)
            
            const currentSeriesPosts = postsData
                .filter(p => p.seriesId === seriesId)
                .sort((a, b) => (a.seriesOrder || 999) - (b.seriesOrder || 999));
            
            setSeriesPosts(currentSeriesPosts);
          } else {
            setError('시리즈를 찾을 수 없습니다.');
          }
        }
      } catch (err) {
        console.error('데이터 로딩 오류:', err);
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        setIsLoading(false);
      }
    }
    initData();
  }, [mode, seriesId]);

  // 슬러그 자동 생성
  useEffect(() => {
    if (mode === 'create' && name && !slug) {
      const generatedSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 50);
      setSlug(generatedSlug);
    }
  }, [name, mode, slug]);

  // 이미지 업로드
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
        fileType: 'image/webp',
      };
      const compressedFile = await imageCompression(file, options);
      const timestamp = Date.now();
      const fileName = `series-covers/${timestamp}-${file.name.replace(/\.[^/.]+$/, '')}.webp`;
      const storageRef = ref(storage, fileName);
      
      await uploadBytes(storageRef, compressedFile);
      const url = await getDownloadURL(storageRef);
      setCoverImage(url);
    } catch (err) {
        console.error('이미지 업로드 실패', err);
        alert('이미지 업로드 실패');
    }
  };

  // 포스트 추가 핸들러
  const handleAddPost = (post: PostItem) => {
    // 이미 있는지 확인
    if (seriesPosts.find(p => p.id === post.id)) return;
    setSeriesPosts([...seriesPosts, post]);
    setIsPostModalOpen(false);
  };

  // 포스트 제거 핸들러
  const handleRemovePost = (postId: string) => {
    setSeriesPosts(seriesPosts.filter(p => p.id !== postId));
  };

  // 순서 변경 (위로)
  const movePostUp = (index: number) => {
    if (index === 0) return;
    const newPosts = [...seriesPosts];
    [newPosts[index - 1], newPosts[index]] = [newPosts[index], newPosts[index - 1]];
    setSeriesPosts(newPosts);
  };

  // 순서 변경 (아래로)
  const movePostDown = (index: number) => {
    if (index === seriesPosts.length - 1) return;
    const newPosts = [...seriesPosts];
    [newPosts[index + 1], newPosts[index]] = [newPosts[index], newPosts[index + 1]];
    setSeriesPosts(newPosts);
  };

  // 저장 핸들러
  const handleSave = async () => {
    if (!name || !slug) {
        alert('시리즈 이름과 URL 슬러그는 필수입니다.');
        return;
    }

    setIsSaving(true);
    try {
        const batch = writeBatch(db);
        const seriesData = {
            name,
            slug,
            description,
            coverImage,
            isPublic,
            order: Number(order),
            postIds: seriesPosts.map(p => p.id), // postIds 필드 업데이트
            postCount: seriesPosts.length,
            updatedAt: Timestamp.now(),
        };

        let targetSeriesId = seriesId;

        if (mode === 'create') {
            const newSeriesRef = await addDoc(collection(db, 'series'), {
                ...seriesData,
                createdAt: Timestamp.now()
            });
            targetSeriesId = newSeriesRef.id;
        } else if (seriesId) {
             const seriesRef = doc(db, 'series', seriesId);
             batch.update(seriesRef, seriesData);
        }

        if (!targetSeriesId) throw new Error("Series ID missing");

        // 1. 현재 시리즈에 포함된 포스트들 업데이트 (seriesId, seriesOrder 설정)
        seriesPosts.forEach((post, index) => {
            const postRef = doc(db, 'posts', post.id);
            batch.update(postRef, {
                seriesId: targetSeriesId,
                seriesOrder: index + 1
            });
        });

        // 2. 이전에 시리즈에 있었으나 제거된 포스트들 처리
        // (기존 allPosts 중에서 seriesId가 현재 시리즈ID인 것들 중, 현재 seriesPosts에 없는 것들)
        const removedPosts = allPosts.filter(p => 
            p.seriesId === targetSeriesId && 
            !seriesPosts.find(sp => sp.id === p.id)
        );

        removedPosts.forEach(post => {
            const postRef = doc(db, 'posts', post.id);
            batch.update(postRef, {
                seriesId: null,
                seriesOrder: null
            });
        });

        await batch.commit();
        
        // 목록으로 이동
        window.location.href = '/admin/series';

    } catch (err) {
        console.error('저장 실패:', err);
        setError('저장 중 오류가 발생했습니다.');
    } finally {
        setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
        <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
    );
  }

  return (
    <AdminGuard>
      <AdminLayout currentPath="/admin/series">
        <div className="mx-auto max-w-4xl space-y-8 pb-20">
            {/* 헤더 */}
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold text-text-primary">
                    {mode === 'create' ? '새 시리즈 작성' : '시리즈 수정'}
                </h1>
                <div className="flex gap-3">
                    <a href="/admin/series" className="rounded-xl border border-border px-4 py-2 font-medium text-text-secondary hover:text-text-primary">
                        취소
                    </a>
                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="rounded-xl bg-brand px-6 py-2 font-bold text-white transition-all hover:brightness-110 disabled:opacity-50"
                    >
                        {isSaving ? '저장 중...' : '저장하기'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl bg-red-500/10 p-4 text-red-500">
                    {error}
                </div>
            )}

            <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
                {/* 왼쪽: 기본 정보 */}
                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-bg-surface p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-text-primary">기본 정보</h2>
                        
                        <div>
                            <label className="mb-1 block text-sm font-medium text-text-secondary">시리즈 이름</label>
                            <input 
                                type="text" 
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full rounded-xl border border-border bg-bg p-3 focus:border-brand focus:outline-none"
                                placeholder="예: React 완전 정복"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-text-secondary">URL 슬러그</label>
                            <input 
                                type="text" 
                                value={slug}
                                onChange={e => setSlug(e.target.value)}
                                className="w-full rounded-xl border border-border bg-bg p-3 focus:border-brand focus:outline-none"
                                placeholder="예: react-complete-guide"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-text-secondary">설명</label>
                            <textarea 
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={4}
                                className="w-full rounded-xl border border-border bg-bg p-3 focus:border-brand focus:outline-none"
                                placeholder="이 시리즈에 대한 설명을 입력하세요..."
                            />
                        </div>
                    </div>

                    {/* 포스트 관리 섹션 */}
                    <div className="rounded-2xl border border-border bg-bg-surface p-6 space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-semibold text-text-primary">포스트 관리</h2>
                            <button 
                                onClick={() => setIsPostModalOpen(true)}
                                className="rounded-lg bg-bg border border-border px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-brand hover:border-brand"
                            >
                                + 포스트 추가
                            </button>
                        </div>

                        {seriesPosts.length === 0 ? (
                            <div className="py-8 text-center text-text-secondary border-2 border-dashed border-border rounded-xl">
                                포스트를 추가하여 시리즈를 구성하세요.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {seriesPosts.map((post, index) => (
                                    <div key={post.id} className="flex items-center justify-between rounded-xl border border-border bg-bg p-3">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
                                                {index + 1}
                                            </div>
                                            <span className="truncate font-medium text-text-primary">{post.title}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded ${post.status === 'published' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                                {post.status}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button 
                                                onClick={() => movePostUp(index)}
                                                disabled={index === 0}
                                                className="p-1 text-text-secondary hover:text-brand disabled:opacity-30"
                                            >
                                                ↑
                                            </button>
                                            <button 
                                                onClick={() => movePostDown(index)}
                                                disabled={index === seriesPosts.length - 1}
                                                className="p-1 text-text-secondary hover:text-brand disabled:opacity-30"
                                            >
                                                ↓
                                            </button>
                                            <button 
                                                onClick={() => handleRemovePost(post.id)}
                                                className="ml-2 p-1 text-text-secondary hover:text-red-500"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* 오른쪽: 설정 및 이미지 */}
                <div className="space-y-6">
                    <div className="rounded-2xl border border-border bg-bg-surface p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-text-primary">설정</h2>
                        
                        <div className="flex items-center justify-between">
                            <span className="font-medium text-text-secondary">공개 여부</span>
                            <button 
                                onClick={() => setIsPublic(!isPublic)}
                                className={`relative h-6 w-11 rounded-full transition-colors ${isPublic ? 'bg-brand' : 'bg-gray-600'}`}
                            >
                                <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${isPublic ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-text-secondary">시리즈 순서 (우선순위)</label>
                            <input 
                                type="number" 
                                value={order}
                                onChange={e => setOrder(Number(e.target.value))}
                                className="w-full rounded-xl border border-border bg-bg p-3 focus:border-brand focus:outline-none"
                            />
                            <p className="mt-1 text-xs text-text-secondary">낮은 숫자가 먼저 표시됩니다.</p>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-border bg-bg-surface p-6 space-y-4">
                        <h2 className="text-xl font-semibold text-text-primary">커버 이미지</h2>
                        
                        <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-bg border border-border">
                            {coverImage ? (
                                <img src={coverImage} alt="Cover" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full items-center justify-center text-text-secondary">
                                    이미지 없음
                                </div>
                            )}
                        </div>

                        <div className="relative">
                            <input 
                                type="file" 
                                accept="image/*"
                                onChange={handleImageUpload}
                                className="absolute inset-0 cursor-pointer opacity-0"
                            />
                            <button className="w-full rounded-xl border border-border bg-bg py-2 font-medium text-text-secondary hover:border-brand hover:text-brand">
                                이미지 업로드
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* 포스트 선택 모달 */}
            {isPostModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                    <div className="flex h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-bg-surface shadow-2xl">
                        <div className="flex items-center justify-between border-b border-border p-4">
                            <h3 className="text-lg font-bold text-text-primary">포스트 추가</h3>
                            <button onClick={() => setIsPostModalOpen(false)} className="text-text-secondary hover:text-text-primary">
                                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="p-4 border-b border-border">
                            <input 
                                type="text"
                                value={postSearchTerm}
                                onChange={e => setPostSearchTerm(e.target.value)}
                                placeholder="포스트 검색..."
                                className="w-full rounded-xl border border-border bg-bg p-3 focus:border-brand focus:outline-none"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-2">
                            {allPosts
                                .filter(p => !seriesPosts.find(sp => sp.id === p.id)) // 이미 추가된 것 제외
                                .filter(p => p.title.toLowerCase().includes(postSearchTerm.toLowerCase()))
                                .map(post => (
                                    <div key={post.id} className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-bg-hover">
                                        <div>
                                            <p className="font-medium text-text-primary">{post.title}</p>
                                            <p className="text-xs text-text-secondary">{post.createdAt?.toLocaleDateString()} · {post.status}</p>
                                        </div>
                                        <button 
                                            onClick={() => handleAddPost(post)}
                                            className="rounded-lg bg-brand/10 px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white"
                                        >
                                            추가
                                        </button>
                                    </div>
                                ))
                            }
                            {allPosts.length === 0 && <p className="text-center text-text-secondary">포스트가 없습니다.</p>}
                        </div>
                    </div>
                </div>
            )}
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
