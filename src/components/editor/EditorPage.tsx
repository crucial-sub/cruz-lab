// 에디터 페이지 래퍼 컴포넌트
// AdminGuard + FullScreenEditor를 결합
import AdminGuard from '@/components/admin/AdminGuard';
import FullScreenEditor from './FullScreenEditor';

interface Props {
  mode: 'create' | 'edit';
  postId?: string;
}

export default function EditorPage({ mode, postId }: Props) {
  return (
    <AdminGuard>
      <FullScreenEditor mode={mode} postId={postId} />
    </AdminGuard>
  );
}
