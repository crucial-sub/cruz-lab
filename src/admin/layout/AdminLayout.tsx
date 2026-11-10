// 관리자 앱 레이아웃 (재건 5단계 D10, M1)
// - 1024px 이상: 왼쪽 메뉴 200px + 내용(최대 1120px).
// - 1024px 미만: 위 막대(제목 · 새 글 · 메뉴 단추). 메뉴는 왼쪽 시트로 연다.
// - 에디터 화면은 이 틀을 쓰지 않는다(전체 화면, AdminApp).

import { useEffect, useRef, useState } from 'react';
import { useAdmin } from '../app-context';
import type { AdminRoute } from '../router';
import { primaryButton } from '../ui';
import { AdminNav } from './AdminNav';

export function AdminLayout({
  current,
  onCreate,
  children,
}: {
  current: AdminRoute['name'];
  onCreate: (kind: 'post' | 'note') => void;
  children: React.ReactNode;
}) {
  const { logout } = useAdmin();
  const [sheetOpen, setSheetOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 시트: Esc로 닫고, 열면 닫기 단추에 초점을 둔다
  useEffect(() => {
    if (!sheetOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setSheetOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  return (
    <div className="min-h-screen bg-bg-app text-text-primary">
      {/* 좁은 화면 위 막대 */}
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b border-border bg-bg-surface px-3 lg:hidden">
        <button
          type="button"
          className="flex size-9 items-center justify-center rounded-md text-lg text-text-secondary hover:bg-bg-card hover:text-text-primary"
          aria-label="메뉴 열기"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen(true)}
        >
          ☰
        </button>
        <a href="/admin" className="mr-auto truncate font-semibold">
          Cruz Lab 관리
        </a>
        <button type="button" className={primaryButton} onClick={() => onCreate('post')}>
          새 글
        </button>
      </header>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="관리자 메뉴"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="메뉴 닫기"
            tabIndex={-1}
            onClick={() => setSheetOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-64 max-w-[80vw] flex-col bg-bg-surface p-3 shadow-popover">
            <div className="mb-3 flex items-center justify-between">
              <span className="px-3 font-semibold">Cruz Lab 관리</span>
              <button
                ref={closeRef}
                type="button"
                className="flex size-9 items-center justify-center rounded-md text-text-secondary hover:bg-bg-card"
                aria-label="메뉴 닫기"
                onClick={() => setSheetOpen(false)}
              >
                ×
              </button>
            </div>
            <AdminNav current={current} onLogout={logout} onNavigate={() => setSheetOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:flex">
        {/* 넓은 화면 왼쪽 메뉴 */}
        <aside className="sticky top-0 hidden h-screen w-[200px] shrink-0 flex-col border-r border-border bg-bg-surface p-3 lg:flex">
          <a href="/admin" className="mb-4 block px-3 py-1 font-semibold">
            Cruz Lab 관리
          </a>
          <AdminNav current={current} onLogout={logout} />
        </aside>
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1120px] px-4 py-5 sm:px-6 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
