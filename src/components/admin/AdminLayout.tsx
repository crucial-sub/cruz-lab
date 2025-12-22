// 관리자 레이아웃 컴포넌트
// 사이드바 + 메인 콘텐츠 영역으로 구성
import { useAdminAuth } from '@/hooks/useAdminAuth';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  currentPath?: string;
}

// 네비게이션 아이템 정의
const navItems = [
  {
    href: '/admin',
    label: '대시보드',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    href: '/admin/posts',
    label: '포스트 관리',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    href: '/admin/series',
    label: '시리즈 관리',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
  },
  {
    href: '/admin/posts/new',
    label: '새 포스트',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 4v16m8-8H4" />
      </svg>
    ),
  },
];

export default function AdminLayout({ children, currentPath = '' }: Props) {
  const { user, logout } = useAdminAuth();

  return (
    <div className="flex min-h-screen bg-bg">
      {/* 사이드바 */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-border bg-bg-surface">
        <div className="flex h-full flex-col">
          {/* 로고 영역 */}
          <div className="flex h-16 items-center border-b border-border px-6">
            <a href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold text-brand">Cruz Lab</span>
              <span className="rounded bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                Admin
              </span>
            </a>
          </div>

          {/* 네비게이션 */}
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => {
              const isActive = currentPath === item.href ||
                (item.href !== '/admin' && currentPath.startsWith(item.href));

              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 font-medium transition-colors ${
                    isActive
                      ? 'bg-brand/20 text-brand border border-brand/30'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* 사용자 정보 & 로그아웃 */}
          <div className="border-t border-border p-4">
            <div className="mb-3 flex items-center gap-3">
              {user?.photoURL && (
                <img
                  src={user.photoURL}
                  alt="프로필"
                  className="h-10 w-10 rounded-full"
                />
              )}
              <div className="flex-1 truncate">
                <p className="truncate text-sm font-medium text-text-primary">
                  {user?.displayName || '관리자'}
                </p>
                <p className="truncate text-xs text-text-secondary">
                  {user?.email}
                </p>
              </div>
            </div>
            <button
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:border-red-500 hover:text-red-500"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              로그아웃
            </button>
          </div>
        </div>
      </aside>

      {/* 메인 콘텐츠 영역 */}
      <main className="ml-64 flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
