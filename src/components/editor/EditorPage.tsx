// 에디터 페이지 래퍼 컴포넌트
// AdminGuard 뒤에서 에디터 본체를 지연 로드한다.
import { Suspense, lazy } from 'react';
import AdminGuard from '@/components/admin/AdminGuard';

const FullScreenEditor = lazy(() => import('./FullScreenEditor'));

interface Props {
  mode: 'create' | 'edit';
  postId?: string;
}

function EditorShellFallback() {
  return (
    <div className="flex h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        <p className="text-sm text-gray-400">에디터 불러오는 중...</p>
      </div>
    </div>
  );
}

export default function EditorPage({ mode, postId }: Props) {
  return (
    <AdminGuard>
      <Suspense fallback={<EditorShellFallback />}>
        <FullScreenEditor mode={mode} postId={postId} />
      </Suspense>
    </AdminGuard>
  );
}
