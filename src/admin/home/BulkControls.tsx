// 글 목록 여러 편 삭제 조각 (2026-11-12 여러 편 삭제 작업)
// - 데스크톱(768px 이상): 표 위 막대. "N편 고름 · 선택 해제 · 삭제". 아무것도 고르지 않으면 "고른 글 없음".
// - 휴대폰(768px 미만): 목록 위 줄에 "선택" 단추. 켜면 "보이는 글 모두" 칸과 "완료",
//   화면 바닥에 "N편 고름 · 해제 · 삭제" 막대가 붙는다.
// - 확인 창 본문: 발행·숨김 글이 섞이면 그 수와 제목(5편까지), 확인 칸(사용자 결정 2).
// - 규칙(고르기·요약·지우기)은 bulk-select.ts에 있다.

import { Checkbox, dangerButton, quietButton, secondaryButton } from '../ui';
import type { DeleteSummary, HeaderCheck } from './bulk-select';

// "3편 고름 (발행·숨김 1편)"
function selectedText(summary: DeleteSummary): string {
  if (summary.count === 0) return '고른 글 없음';
  const publicCount = summary.published + summary.hidden;
  return `${summary.count}편 고름${publicCount > 0 ? ` (발행·숨김 ${publicCount}편)` : ''}`;
}

// 데스크톱 표 위 막대
export function DesktopSelectionBar({
  summary,
  busy,
  onClear,
  onDelete,
}: {
  summary: DeleteSummary;
  busy: boolean;
  onClear: () => void;
  onDelete: () => void;
}) {
  const none = summary.count === 0;
  return (
    <div className="mb-2 hidden items-center gap-2 rounded-md border border-border bg-bg-surface px-3 py-1.5 text-sm md:flex">
      <span
        className={none ? 'mr-auto text-text-secondary' : 'mr-auto text-text-primary'}
        aria-live="polite"
      >
        {selectedText(summary)}
      </span>
      <button type="button" className={quietButton} onClick={onClear} disabled={none || busy}>
        선택 해제
      </button>
      <button type="button" className={dangerButton} onClick={onDelete} disabled={none || busy}>
        삭제
      </button>
    </div>
  );
}

// 휴대폰 목록 위 줄: 선택 모드 켜기·끄기, 켰을 때 "보이는 글 모두" 칸
export function MobileSelectionHeader({
  mode,
  header,
  visibleCount,
  busy,
  onStart,
  onDone,
  onToggleAll,
}: {
  mode: boolean;
  header: HeaderCheck;
  visibleCount: number;
  busy: boolean;
  onStart: () => void;
  onDone: () => void;
  onToggleAll: () => void;
}) {
  return (
    <div className="mb-1 flex min-h-9 items-center gap-2 md:hidden">
      {mode ? (
        <label className="mr-auto flex cursor-pointer items-center gap-3 py-1 pl-1 text-sm text-text-primary">
          <Checkbox
            checked={header === 'all'}
            indeterminate={header === 'some'}
            disabled={busy}
            className="size-5"
            onChange={onToggleAll}
          />
          보이는 글 모두 ({visibleCount})
        </label>
      ) : (
        <span className="mr-auto" />
      )}
      <button
        type="button"
        className={secondaryButton}
        onClick={mode ? onDone : onStart}
        disabled={busy}
      >
        {mode ? '완료' : '선택'}
      </button>
    </div>
  );
}

// 휴대폰 바닥 막대(선택 모드일 때만). 홈 막대 자리를 비운다(safe-area)
export function MobileSelectionFooter({
  summary,
  busy,
  onClear,
  onDelete,
}: {
  summary: DeleteSummary;
  busy: boolean;
  onClear: () => void;
  onDelete: () => void;
}) {
  const none = summary.count === 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg-surface px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 md:hidden">
      <div className="flex items-center gap-2 text-sm">
        <span
          className={none ? 'mr-auto text-text-secondary' : 'mr-auto text-text-primary'}
          aria-live="polite"
        >
          {selectedText(summary)}
        </span>
        <button type="button" className={quietButton} onClick={onClear} disabled={none || busy}>
          해제
        </button>
        <button type="button" className={dangerButton} onClick={onDelete} disabled={none || busy}>
          삭제
        </button>
      </div>
    </div>
  );
}

// 확인 창 본문. 발행·숨김 글이 섞이면 빨간 칸과 확인 칸을 보인다
export function BulkDeleteBody({
  summary,
  acknowledged,
  busy,
  onAcknowledge,
}: {
  summary: DeleteSummary;
  acknowledged: boolean;
  busy: boolean;
  onAcknowledge: () => void;
}) {
  const publicCount = summary.published + summary.hidden;
  return (
    <>
      <p>초안·발행본·이전 판을 함께 지웁니다. 되돌릴 수 없습니다.</p>
      {publicCount > 0 && (
        <>
          <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-red-700 dark:text-red-300">
            <p>
              발행·숨김 글 {publicCount}편이 섞여 있습니다.
              {summary.published > 0 &&
                ` 발행 글 ${summary.published}편은 공개 주소가 404가 됩니다.`}
              {summary.hidden > 0 && ` 숨김 글 ${summary.hidden}편은 발행본도 함께 지웁니다.`}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {summary.publicTitles.map((title, index) => (
                <li key={`${index}-${title}`} className="break-all">
                  「{title}」
                </li>
              ))}
              {summary.moreTitles > 0 && <li>외 {summary.moreTitles}편</li>}
            </ul>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-text-primary">
            <Checkbox checked={acknowledged} disabled={busy} onChange={onAcknowledge} />
            발행·숨김 글 {publicCount}편도 지웁니다
          </label>
        </>
      )}
    </>
  );
}

// 일부 실패 결과 본문
export function BulkResultBody({
  deleted,
  failed,
}: {
  deleted: number;
  failed: Array<{ id: string; title: string; message: string }>;
}) {
  return (
    <>
      <p className="text-text-primary">
        {deleted}편을 지웠습니다. {failed.length}편은 지우지 못했습니다.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {failed.map((item) => (
          <li key={item.id} className="break-all">
            「{item.title}」 · {item.message}
          </li>
        ))}
      </ul>
      <p>지우지 못한 글은 고른 채로 남깁니다. 삭제를 다시 누르면 그 글만 다시 지웁니다.</p>
    </>
  );
}
