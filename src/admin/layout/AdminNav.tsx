// 관리자 앱 메뉴 (재건 5단계 D10)
// - 화면을 만든 메뉴만 보인다. PR-A: 글, 출간 기록. PR-B: 이미지, 분류, 연재. PR-C: 설정. 독자는 PR-D가 더한다.
// - 순서는 Plan D10을 따른다(글·이미지·분류·연재·독자·출간 기록·설정).
// - 아래: 사이트 보기(새 탭), 로그아웃.
// - 넓은 화면(1024px 이상)은 왼쪽 막대, 좁은 화면은 시트 안에 같은 메뉴를 그린다.

import { classNames } from '@/editor/ui/class-names';
import type { AdminRoute } from '../router';

export const NAV_ITEMS: ReadonlyArray<{ name: AdminRoute['name']; href: string; label: string }> = [
  { name: 'home', href: '/admin', label: '글' },
  { name: 'assets', href: '/admin/assets', label: '이미지' },
  { name: 'taxonomy', href: '/admin/taxonomy', label: '분류' },
  { name: 'series', href: '/admin/series', label: '연재' },
  { name: 'log', href: '/admin/log', label: '출간 기록' },
  { name: 'settings', href: '/admin/settings', label: '설정' },
];

export function AdminNav({
  current,
  onLogout,
  onNavigate,
}: {
  current: AdminRoute['name'];
  onLogout: () => void;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="관리자 메뉴" className="flex h-full flex-col gap-1 text-sm">
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <li key={item.name}>
            <a
              href={item.href}
              aria-current={item.name === current ? 'page' : undefined}
              onClick={onNavigate}
              className={classNames(
                'block rounded-md px-3 py-2',
                item.name === current
                  ? 'bg-bg-card font-semibold text-text-primary'
                  : 'text-text-secondary hover:bg-bg-card hover:text-text-primary',
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md px-3 py-2 text-text-secondary hover:bg-bg-card hover:text-text-primary"
        >
          사이트 보기 ↗
        </a>
        <button
          type="button"
          onClick={onLogout}
          className="rounded-md px-3 py-2 text-left text-text-secondary hover:bg-bg-card hover:text-text-primary"
        >
          로그아웃
        </button>
      </div>
    </nav>
  );
}
