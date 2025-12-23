// 시리즈 에디터 컴포넌트
import { useState, useEffect, useMemo } from 'react';
import { collection, query, orderBy, getDocs, doc, writeBatch, getDoc, Timestamp, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, initializeFirebase } from '@/lib/firebase';
import AdminGuard from '../AdminGuard';
import AdminLayout from '../AdminLayout';
import type { Post } from '@/lib/posts';
import type { Series } from '@/lib/series';
import imageCompression from 'browser-image-compression';
import { Reorder } from 'framer-motion';
import { 
  Plus, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Search, 
  X, 
  Check, 
  Image as ImageIcon,
  Save,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  GripVertical
} from 'lucide-react';

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
  const [selectedInModal, setSelectedInModal] = useState<Set<string>>(new Set());

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
        const postsQ = query(postsRef, orderBy('pubDate', 'desc'));
        const postsSnap = await getDocs(postsQ);
        const postsData = postsSnap.docs.map(d => {
            const data = d.data();
            return { 
                id: d.id, 
                ...data,
                pubDate: data.pubDate?.toDate() || new Date(),
                updatedDate: data.updatedDate?.toDate() || new Date()
            } as PostItem;
        });
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

  // 모달 검색 필터링된 포스트 목록
  const filteredPostsInModal = useMemo(() => {
    return allPosts.filter(p => 
        p.title.toLowerCase().includes(postSearchTerm.toLowerCase()) ||
        p.tags.some(t => t.toLowerCase().includes(postSearchTerm.toLowerCase()))
    );
  }, [allPosts, postSearchTerm]);

  // 모달 내 포스트 선택 토글
  const togglePostSelection = (postId: string) => {
    if (seriesPosts.find(p => p.id === postId)) return;

    const newSelected = new Set(selectedInModal);
    if (newSelected.has(postId)) {
      newSelected.delete(postId);
    } else {
      newSelected.add(postId);
    }
    setSelectedInModal(newSelected);
  };

  // 모달 전체 선택/해제
  const toggleSelectAll = () => {
    const availablePosts = filteredPostsInModal.filter(p => !seriesPosts.find(sp => sp.id === p.id));
    
    if (selectedInModal.size === availablePosts.length && availablePosts.length > 0) {
      setSelectedInModal(new Set());
    } else {
      setSelectedInModal(new Set(availablePosts.map(p => p.id)));
    }
  };

  // 선택된 포스트들을 시리즈에 추가
  const addSelectedPosts = () => {
    // 선택된 포스트들을 필터링하고 날짜 오름차순(과거순)으로 정렬하여 추가
    const postsToAdd = allPosts
      .filter(p => selectedInModal.has(p.id))
      .sort((a, b) => a.pubDate.getTime() - b.pubDate.getTime());
      
    setSeriesPosts([...seriesPosts, ...postsToAdd]);
    setIsPostModalOpen(false);
    setSelectedInModal(new Set());
    setPostSearchTerm('');
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
            postIds: seriesPosts.map(p => p.id),
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

        // 1. 현재 시리즈에 포함된 포스트들 업데이트
        seriesPosts.forEach((post, index) => {
            const postRef = doc(db, 'posts', post.id);
            batch.update(postRef, {
                seriesId: targetSeriesId,
                seriesOrder: index + 1
            });
        });

        // 2. 이전에 시리즈에 있었으나 제거된 포스트들 처리
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
        <div className="mx-auto max-w-5xl space-y-8 pb-20">
            {/* 상단 네비게이션 */}
            <div className="flex items-center gap-4">
                <a href="/admin/series" className="rounded-full p-2 text-text-secondary hover:bg-bg-card hover:text-text-primary">
                    <ArrowLeft size={24} />
                </a>
                <h1 className="text-3xl font-bold text-text-primary">
                    {mode === 'create' ? '새 시리즈 작성' : '시리즈 수정'}
                </h1>
                <div className="ml-auto flex gap-3">
                    <button 
                        onClick={handleSave}
                        disabled={isSaving}
                        className="flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 font-bold text-white shadow-lg shadow-brand/20 transition-all hover:brightness-110 disabled:opacity-50"
                    >
                        {isSaving ? (
                             <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        ) : <Save size={20} />}
                        {isSaving ? '저장 중...' : '저장하기'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-red-500 flex items-center gap-3">
                    <span className="font-bold">⚠️ 오류:</span> {error}
                </div>
            )}

            <div className="grid gap-8 lg:grid-cols-[1fr_350px]">
                {/* 왼쪽: 상세 정보 및 포스트 목록 */}
                <div className="space-y-8">
                    {/* 기본 정보 카드 */}
                    <div className="overflow-hidden rounded-2xl border border-border bg-bg-surface">
                        <div className="border-b border-border bg-bg-card/50 px-6 py-4">
                            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-brand"></span>
                                기본 정보
                            </h2>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="grid gap-5 md:grid-cols-2">
                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-text-secondary">시리즈 이름</label>
                                    <input 
                                        type="text" 
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        className="w-full rounded-xl border border-border bg-bg p-3 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-all"
                                        placeholder="예: React 완전 정복"
                                    />
                                </div>
                                <div>
                                    <label className="mb-2 block text-sm font-semibold text-text-secondary">URL 슬러그</label>
                                    <input 
                                        type="text" 
                                        value={slug}
                                        onChange={e => setSlug(e.target.value)}
                                        className="w-full rounded-xl border border-border bg-bg p-3 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-all font-mono text-sm"
                                        placeholder="react-complete-guide"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm font-semibold text-text-secondary">시리즈 설명</label>
                                <textarea 
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={4}
                                    className="w-full rounded-xl border border-border bg-bg p-4 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-all resize-none"
                                    placeholder="이 시리즈에 대한 설명을 상세히 입력하세요..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* 포스트 관리 섹션 (Reorder 적용) */}
                    <div className="overflow-hidden rounded-2xl border border-border bg-bg-surface">
                        <div className="border-b border-border bg-bg-card/50 px-6 py-4 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-brand"></span>
                                포스트 관리 ({seriesPosts.length})
                            </h2>
                            <button 
                                onClick={() => setIsPostModalOpen(true)}
                                className="flex items-center gap-1.5 rounded-lg bg-brand/10 px-4 py-1.5 text-sm font-bold text-brand hover:bg-brand hover:text-white transition-all"
                            >
                                <Plus size={16} />
                                포스트 추가
                            </button>
                        </div>

                        <div className="p-6">
                            {seriesPosts.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-2xl bg-bg/30">
                                    <div className="mb-3 rounded-full bg-bg-card p-4 text-text-secondary">
                                        <Plus size={32} />
                                    </div>
                                    <p className="font-medium text-text-primary">추가된 포스트가 없습니다.</p>
                                    <p className="mt-1 text-sm text-text-secondary">시리즈를 구성할 포스트를 선택해 주세요.</p>
                                    <button 
                                        onClick={() => setIsPostModalOpen(true)}
                                        className="mt-4 text-brand font-bold text-sm hover:underline"
                                    >
                                        포스트 선택하러 가기
                                    </button>
                                </div>
                            ) : (
                                <Reorder.Group 
                                    axis="y" 
                                    values={seriesPosts} 
                                    onReorder={setSeriesPosts}
                                    className="space-y-3"
                                >
                                    {seriesPosts.map((post, index) => (
                                        <Reorder.Item 
                                            key={post.id} 
                                            value={post}
                                            className="group flex items-center justify-between rounded-xl border border-border bg-bg p-4 hover:border-brand/30 hover:bg-bg-hover transition-all shadow-sm"
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                                                <div className="cursor-grab active:cursor-grabbing text-text-secondary opacity-20 hover:opacity-100 transition-opacity p-1">
                                                    <GripVertical size={20} />
                                                </div>
                                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white shadow-md shadow-brand/20">
                                                    {index + 1}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <span className="truncate font-bold text-text-primary">{post.title}</span>
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${post.status === 'published' ? 'bg-green-500/10 text-green-500' : 'bg-yellow-500/10 text-yellow-500'}`}>
                                                            {post.status}
                                                        </span>
                                                        <span className="text-[10px] text-text-secondary flex items-center gap-1">
                                                            <Calendar size={10} />
                                                            {post.pubDate.toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                                                <div className="flex items-center rounded-lg border border-border bg-bg-card overflow-hidden">
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            movePostUp(index);
                                                        }}
                                                        disabled={index === 0}
                                                        className="p-1.5 text-text-secondary hover:text-brand hover:bg-bg disabled:opacity-30 border-r border-border"
                                                        title="위로 이동"
                                                    >
                                                        <ArrowUp size={16} />
                                                    </button>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            movePostDown(index);
                                                        }}
                                                        disabled={index === seriesPosts.length - 1}
                                                        className="p-1.5 text-text-secondary hover:text-brand hover:bg-bg disabled:opacity-30"
                                                        title="아래로 이동"
                                                    >
                                                        <ArrowDown size={16} />
                                                    </button>
                                                </div>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemovePost(post.id);
                                                    }}
                                                    className="p-2 text-text-secondary hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                    title="제거"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </Reorder.Item>
                                    ))}
                                </Reorder.Group>
                            )}
                        </div>
                    </div>
                </div>

                {/* 오른쪽: 설정 사이드바 */}
                <div className="space-y-6">
                    {/* 설정 카드 */}
                    <div className="overflow-hidden rounded-2xl border border-border bg-bg-surface">
                        <div className="border-b border-border bg-bg-card/50 px-6 py-4">
                            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-brand"></span>
                                설정
                            </h2>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                    <span className="font-bold text-text-primary text-sm">공개 여부</span>
                                    <span className="text-xs text-text-secondary">블로그에 표시할지 결정</span>
                                </div>
                                <button 
                                    onClick={() => setIsPublic(!isPublic)}
                                    className={`relative h-6 w-11 rounded-full transition-colors focus:outline-none ${isPublic ? 'bg-brand' : 'bg-gray-600'}`}
                                >
                                    <span className={`absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform ${isPublic ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>

                            <div className="pt-4 border-t border-border">
                                <label className="mb-2 block text-sm font-semibold text-text-secondary">정렬 순서</label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        value={order}
                                        onChange={e => setOrder(Number(e.target.value))}
                                        className="w-full rounded-xl border border-border bg-bg p-3 focus:border-brand focus:outline-none font-bold"
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary pointer-events-none">
                                        우선순위
                                    </div>
                                </div>
                                <p className="mt-2 text-[11px] text-text-secondary leading-relaxed">
                                    시리즈 목록에서 보여질 순서입니다.<br/>숫자가 낮을수록 앞쪽에 표시됩니다.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 커버 이미지 카드 */}
                    <div className="overflow-hidden rounded-2xl border border-border bg-bg-surface">
                        <div className="border-b border-border bg-bg-card/50 px-6 py-4">
                            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-brand"></span>
                                커버 이미지
                            </h2>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="group relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-bg border border-border">
                                {coverImage ? (
                                    <img src={coverImage} alt="Cover" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                ) : (
                                    <div className="flex h-full flex-col items-center justify-center text-text-secondary gap-2">
                                        <ImageIcon size={40} className="opacity-20" />
                                        <span className="text-sm font-medium">이미지 권장: 800x600</span>
                                    </div>
                                )}
                                {coverImage && (
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <button 
                                            onClick={() => setCoverImage('')}
                                            className="bg-red-500 text-white p-2 rounded-full shadow-lg"
                                            title="이미지 제거"
                                        >
                                            <X size={20} />
                                        </button>
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
                                <button className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-bg py-3 text-sm font-bold text-text-secondary hover:border-brand hover:text-brand transition-all">
                                    <ImageIcon size={18} />
                                    이미지 업로드
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 포스트 선택 모달 (다중 선택 개선) */}
            {isPostModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="flex h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-bg-surface shadow-2xl border border-border animate-in zoom-in-95 duration-200">
                        {/* 모달 헤더 */}
                        <div className="flex items-center justify-between border-b border-border bg-bg-card/50 px-6 py-4">
                            <div>
                                <h3 className="text-xl font-bold text-text-primary">포스트 추가</h3>
                                <p className="text-sm text-text-secondary">시리즈에 포함할 포스트를 모두 선택해 주세요.</p>
                            </div>
                            <button 
                                onClick={() => {
                                    setIsPostModalOpen(false);
                                    setSelectedInModal(new Set());
                                }} 
                                className="rounded-full p-2 text-text-secondary hover:bg-bg-card hover:text-text-primary transition-colors"
                            >
                                <X size={24} />
                            </button>
                        </div>
                        
                        {/* 검색 및 제어 바 */}
                        <div className="p-4 border-b border-border bg-bg/50 flex flex-col md:flex-row gap-4 items-center">
                            <div className="relative flex-1 w-full">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary">
                                    <Search size={18} />
                                </div>
                                <input 
                                    type="text"
                                    value={postSearchTerm}
                                    onChange={e => setPostSearchTerm(e.target.value)}
                                    placeholder="포스트 제목 또는 태그 검색..."
                                    className="w-full rounded-xl border border-border bg-bg pl-11 pr-4 py-2.5 focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-all"
                                />
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div 
                                        onClick={toggleSelectAll}
                                        className={`flex h-5 w-5 items-center justify-center rounded border transition-all ${
                                            selectedInModal.size > 0 && selectedInModal.size === filteredPostsInModal.filter(p => !seriesPosts.find(sp => sp.id === p.id)).length
                                            ? 'bg-brand border-brand text-white' 
                                            : 'border-border bg-bg group-hover:border-brand'
                                        }`}
                                    >
                                        {selectedInModal.size > 0 && <Check size={14} strokeWidth={4} />}
                                    </div>
                                    <span className="text-sm font-bold text-text-secondary select-none">전체 선택</span>
                                </label>
                            </div>
                        </div>

                        {/* 포스트 목록 영역 */}
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                            <div className="grid gap-2">
                                {filteredPostsInModal.map(post => {
                                    const isAlreadyInSeries = seriesPosts.find(sp => sp.id === post.id);
                                    const isSelected = selectedInModal.has(post.id);
                                    
                                    return (
                                        <div 
                                            key={post.id} 
                                            onClick={() => !isAlreadyInSeries && togglePostSelection(post.id)}
                                            className={`flex items-center justify-between rounded-xl border p-4 transition-all ${
                                                isAlreadyInSeries 
                                                ? 'bg-bg-card/30 border-border opacity-50 cursor-not-allowed' 
                                                : isSelected
                                                ? 'bg-brand/5 border-brand ring-1 ring-brand cursor-pointer'
                                                : 'bg-bg border-border hover:border-brand/50 hover:bg-bg-hover cursor-pointer'
                                            }`}
                                        >
                                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all ${
                                                    isSelected ? 'bg-brand border-brand text-white' : 'border-border bg-bg-card'
                                                }`}>
                                                    {(isSelected || isAlreadyInSeries) && <Check size={14} strokeWidth={4} />}
                                                </div>
                                                <div className="flex flex-col min-w-0">
                                                    <p className={`font-bold truncate ${isSelected ? 'text-brand' : 'text-text-primary'}`}>
                                                        {post.title}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar size={12} />
                                                            {post.pubDate.toLocaleDateString()}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <span className="h-1 w-1 rounded-full bg-text-secondary opacity-30"></span>
                                                            {post.status}
                                                        </span>
                                                        {post.tags.length > 0 && (
                                                            <span className="truncate">
                                                                · {post.tags.slice(0, 2).join(', ')}{post.tags.length > 2 ? '...' : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            {isAlreadyInSeries && (
                                                <div className="flex items-center gap-1.5 text-xs font-bold text-brand bg-brand/10 px-2 py-1 rounded-full">
                                                    <CheckCircle2 size={12} />
                                                    추가됨
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                
                                {filteredPostsInModal.length === 0 && (
                                    <div className="py-20 text-center">
                                        <p className="text-text-secondary font-medium">검색 결과가 없습니다.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 모달 푸터 */}
                        <div className="border-t border-border bg-bg-card/50 px-6 py-4 flex items-center justify-between">
                            <div className="text-sm font-medium text-text-secondary">
                                <span className="font-bold text-brand">{selectedInModal.size}</span>개의 포스트 선택됨
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => {
                                        setIsPostModalOpen(false);
                                        setSelectedInModal(new Set());
                                    }}
                                    className="px-5 py-2 text-sm font-bold text-text-secondary hover:text-text-primary"
                                >
                                    취소
                                </button>
                                <button 
                                    onClick={addSelectedPosts}
                                    disabled={selectedInModal.size === 0}
                                    className="flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand/20 transition-all hover:brightness-110 disabled:opacity-50 disabled:grayscale disabled:shadow-none"
                                >
                                    <Plus size={18} />
                                    {selectedInModal.size}개의 포스트 추가하기
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
