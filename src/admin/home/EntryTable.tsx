// 글 목록 표 (재건 5단계 D10, M6·M11)
// - 768px 이상: 표. 제목(아래 작게 slug) · 종류 · 상태(+ 변경 있음) · 분류 · 30일 독자 · 고친 때 · 발행일 · ⋯
// - 768px 미만: 두 줄 행. 제목 / 종류 · 상태 · 독자 · 고친 때. 행 끝 ⋯
// - 제목은 에디터 링크다(앱 안 이동). ⋯ 메뉴: 공개 페이지 보기, 숨기기/다시 보이기, 삭제.
//   "독자 보기"는 독자 화면을 만드는 PR-D가 더한다(D20).
// - 독자 열은 자리만 있다. 값은 독자 흐름(PR-D) 뒤에 채운다.

import { classNames } from '@/editor/ui/class-names';
import type { EntryKind, EntryStatus } from '@/lib/entry-schema';
import type { AdminListItem } from '@/lib/server/admin-entries';
import { editPath } from '../router';
import { formatFullDate, formatShortDate, RowMenu, type MenuItem } from '../ui';
import { classificationOf } from './list-filter';

export const KIND_LABELS: Record<EntryKind, string> = {
  post: '글',
  note: '노트',
  project: '프로젝트',
};
export const STATUS_LABELS: Record<EntryStatus, string> = {
  draft: '초안',
  published: '발행',
  hidden: '숨김',
};

export interface RowActions {
  onToggleVisibility: (item: AdminListItem) => void;
  onDelete: (item: AdminListItem) => void;
}

function readersText(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('ko-KR');
}

function StatusBadge({ item }: { item: AdminListItem }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span
        className={classNames(
          'rounded-pill px-2 py-0.5 text-xs',
          item.status === 'published'
            ? 'bg-emerald-500/15 text-brand'
            : item.status === 'hidden'
              ? 'bg-bg-card text-text-secondary'
              : 'border border-border text-text-secondary',
        )}
      >
        {STATUS_LABELS[item.status]}
      </span>
      {item.hasUnpublishedChanges && <span className="text-xs text-amber-400">변경 있음</span>}
    </span>
  );
}

function menuItems(item: AdminListItem, actions: RowActions): MenuItem[] {
  const items: MenuItem[] = [];
  if (item.publicPath && item.status === 'published')
    items.push({ label: '공개 페이지 보기 ↗', href: item.publicPath, external: true });
  if (item.status === 'published' || item.status === 'hidden') {
    items.push({
      label: item.status === 'hidden' ? '다시 보이기' : '숨기기',
      onSelect: () => actions.onToggleVisibility(item),
    });
  }
  items.push({ label: '삭제', danger: true, onSelect: () => actions.onDelete(item) });
  return items;
}

const titleText = (item: AdminListItem) => item.title || '(제목 없음)';

export function EntryTable({
  items,
  categoryLabel,
  actions,
  now,
}: {
  items: AdminListItem[];
  categoryLabel: (key: string) => string;
  actions: RowActions;
  now: Date;
}) {
  if (items.length === 0) {
    return <p className="py-12 text-center text-sm text-text-secondary">맞는 글이 없습니다.</p>;
  }

  return (
    <>
      {/* 768px 이상: 표 */}
      <table className="hidden w-full table-fixed border-collapse text-sm md:table">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-secondary">
            <th scope="col" className="py-2 pr-3 font-medium">
              제목
            </th>
            <th scope="col" className="w-16 py-2 pr-3 font-medium">
              종류
            </th>
            <th scope="col" className="w-28 py-2 pr-3 font-medium">
              상태
            </th>
            <th scope="col" className="w-28 py-2 pr-3 font-medium">
              분류
            </th>
            <th scope="col" className="w-[4.5rem] py-2 pr-3 text-right font-medium">
              30일 독자
            </th>
            <th scope="col" className="w-20 py-2 pr-3 font-medium">
              고친 때
            </th>
            <th scope="col" className="w-24 py-2 pr-3 font-medium">
              발행일
            </th>
            <th scope="col" className="w-10 py-2">
              <span className="sr-only">메뉴</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border align-middle hover:bg-bg-surface">
              <td className="py-2 pr-3">
                <a
                  href={editPath(item.id)}
                  className="block min-w-0 text-text-primary hover:underline"
                >
                  <span
                    className={classNames(
                      'block truncate font-medium',
                      !item.title && 'text-text-secondary',
                    )}
                  >
                    {titleText(item)}
                  </span>
                  {item.slug && (
                    <span className="block truncate text-xs text-text-secondary">{item.slug}</span>
                  )}
                </a>
              </td>
              <td className="py-2 pr-3 text-text-secondary">{KIND_LABELS[item.kind]}</td>
              <td className="py-2 pr-3">
                <StatusBadge item={item} />
              </td>
              <td className="truncate py-2 pr-3 text-text-secondary">
                {classificationOf(item, categoryLabel)}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums text-text-secondary">
                {readersText(item.readers30)}
              </td>
              <td className="py-2 pr-3 text-text-secondary" title={formatFullDate(item.updatedAt)}>
                {formatShortDate(item.updatedAt, now)}
              </td>
              <td
                className="py-2 pr-3 text-text-secondary"
                title={formatFullDate(item.publishedAt)}
              >
                {formatShortDate(item.publishedAt, now)}
              </td>
              <td className="py-1">
                <RowMenu label={`${titleText(item)} 메뉴`} items={menuItems(item, actions)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 768px 미만: 두 줄 행 */}
      <ul className="divide-y divide-border md:hidden">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-2.5">
            <a href={editPath(item.id)} className="min-w-0 flex-1 text-text-primary">
              <span
                className={classNames(
                  'block truncate font-medium',
                  !item.title && 'text-text-secondary',
                )}
              >
                {titleText(item)}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-text-secondary">
                <span>{KIND_LABELS[item.kind]}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {STATUS_LABELS[item.status]}
                  {item.hasUnpublishedChanges && (
                    <span className="ml-1 text-amber-400">변경 있음</span>
                  )}
                </span>
                <span aria-hidden="true">·</span>
                <span>독자 {readersText(item.readers30)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatShortDate(item.updatedAt, now)}</span>
              </span>
            </a>
            <RowMenu label={`${titleText(item)} 메뉴`} items={menuItems(item, actions)} />
          </li>
        ))}
      </ul>
    </>
  );
}
