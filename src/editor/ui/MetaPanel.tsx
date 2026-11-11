// 메타 패널 (재건 3단계 D13)
// - 상태, 설명, slug(제목에서 제안), 카테고리, 태그(최대 3), 연재 key·순서, 표지(생성/이미지).
// - 422 항목별 이유(issues)를 해당 칸 아래에 붙인다.
// - 데스크톱은 오른쪽 320px 고정 패널, 좁은 화면은 오른쪽에서 나오는 시트다. 접을 수 있다.
// - 시트와 어두운 덮개는 상단 바(48px) 아래에서 시작한다. 시트가 열려 있어도 발행·메뉴를 누를 수 있다.
// - 개요·글자 수·읽기 시간(Outline). 요약은 EditorApp이 300ms 디바운스해 넘긴다.
// - 640px보다 좁은 화면(모바일, D12)에서는 발행 버튼이 이 시트 맨 위에 있다.
// - 5단계 D1·D2: 카테고리 칸은 분류 API의 목록을 쓰고 맨 아래 "+ 새 카테고리"(이름·주소 key)가 있다.
//   태그 칸은 기존 태그를, 연재 칸은 기존 연재 key를 제안한다. 목록을 받지 못했으면 코드 기본 카테고리를 쓴다.

import { useId, useState } from 'react';
import type { DraftMeta } from '@/editor/state/change';
import { suggestSlug } from '@/editor/state/slug';
import type { DocSummary } from '@/editor/state/summary';
import type { EntryKind, EntryStatus } from '@/lib/entry-schema';
import { CATEGORIES, MAX_TAGS, normalizeTag, normalizeTagIn } from '@/lib/taxonomy';
import type { ClassOptions } from './class-options';
import { Outline } from './Outline';

export interface MetaPanelProps {
  open: boolean;
  onClose: () => void;
  kind: EntryKind;
  status: EntryStatus;
  hasUnpublishedChanges: boolean;
  meta: DraftMeta;
  onChange: (patch: Partial<DraftMeta>) => void;
  issues: Record<string, string>;
  coverUploading: boolean;
  onCoverFile: (file: File) => void;
  summary: DocSummary | null;
  onJumpToHeading: (index: number) => void;
  onPublish: () => void;
  publishing: boolean;
  // 분류 선택지(5단계 D1·D2). 아직 받지 못했거나 실패하면 null
  classOptions: ClassOptions | null;
  // 새 카테고리 만들기. 실패하면 오류를 던진다
  onCreateCategory: (label: string, key: string) => Promise<void>;
}

const STATUS_LABELS: Record<EntryStatus, string> = {
  draft: '초안',
  published: '발행됨',
  hidden: '숨김',
};

// 입력 칸 공통 모양(폭 제외). 폭은 칸마다 정한다
const fieldClass =
  'rounded-md border border-border bg-bg-app px-2.5 py-1.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus:border-brand';
const inputClass = `w-full ${fieldClass}`;

function Field({
  label,
  issue,
  children,
}: {
  label: string;
  issue?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold text-text-secondary">{label}</div>
      {children}
      {issue && (
        <p className="text-xs text-red-400" role="alert">
          {issue}
        </p>
      )}
    </div>
  );
}

export function MetaPanel(props: MetaPanelProps) {
  const { meta, onChange, issues } = props;
  const [tagInput, setTagInput] = useState('');
  const listId = useId();
  // "+ 새 카테고리" 입력(이름·주소 key)
  const [newCategory, setNewCategory] = useState<{ label: string; key: string } | null>(null);
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const options = props.classOptions;
  const categories = options?.categories ?? CATEGORIES.map(({ key, label }) => ({ key, label }));
  // 목록에 없는 key: 분류를 받았을 때만 "(목록에 없음)"이라고 쓴다. 받지 못했으면 key만 보인다(PR-B 리뷰 B3)
  const unknownCategory = meta.category && !categories.some((category) => category.key === meta.category) ? meta.category : null;
  const tagSuggestions = (options?.tags ?? []).filter((tag) => !meta.tags.includes(tag));

  const submitNewCategory = async () => {
    if (!newCategory || categoryBusy) return;
    const key = newCategory.key.trim();
    setCategoryBusy(true);
    setCategoryError(null);
    try {
      await props.onCreateCategory(newCategory.label, key);
      onChange({ category: key });
      setNewCategory(null);
    } catch (error) {
      setCategoryError(error instanceof Error ? error.message : '만들지 못했습니다.');
    } finally {
      setCategoryBusy(false);
    }
  };
  // "이미지" 표지를 골랐지만 아직 올리지 않았다. 주소가 빈 표지는 서버가 받지 않으므로 메타에 넣지 않는다(리뷰 6.2 지적 8)
  const [pickingCoverImage, setPickingCoverImage] = useState(false);
  const showCoverUpload = meta.cover.kind === 'image' || pickingCoverImage;

  // 태그 입력: Enter나 쉼표로 더한다. 정규화 뒤 중복·빈 값은 빼고 3개까지다
  const addTag = () => {
    // 데이터 별칭(태그 바꾸기·합치기 뒤)을 따른다. 분류를 받지 못했으면 코드 규칙만
    const tag = options ? normalizeTagIn(options.taxonomy, tagInput) : normalizeTag(tagInput);
    setTagInput('');
    if (!tag || meta.tags.includes(tag) || meta.tags.length >= MAX_TAGS) return;
    onChange({ tags: [...meta.tags, tag] });
  };

  const seriesKey = meta.series?.key ?? '';
  const seriesOrder = meta.series?.order ?? 1;
  const updateSeries = (key: string, order: number) => {
    onChange({
      series: key.trim() ? { key: key.trim(), order: Math.max(1, Math.floor(order) || 1) } : null,
    });
  };

  if (!props.open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-x-0 bottom-0 top-12 z-20 bg-black/40 lg:hidden"
        aria-label="메타 패널 닫기"
        onClick={props.onClose}
      />
      <aside
        className="fixed bottom-0 right-0 top-12 z-30 flex w-80 max-w-full flex-col overflow-y-auto border-l border-border bg-bg-surface shadow-popover lg:static lg:z-auto lg:shadow-none"
        aria-label="메타 패널"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="rounded-pill border border-border px-2 py-0.5 text-xs text-text-secondary">
              {STATUS_LABELS[props.status]}
            </span>
            {props.hasUnpublishedChanges && (
              <span className="text-xs text-amber-400">발행 뒤 변경 있음</span>
            )}
          </div>
          <button
            type="button"
            className="text-sm text-text-secondary hover:text-text-primary"
            onClick={props.onClose}
          >
            닫기
          </button>
        </div>

        <div className="space-y-5 px-4 py-4">
          <button
            type="button"
            className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-hover disabled:opacity-50 sm:hidden"
            onClick={props.onPublish}
            disabled={props.publishing}
          >
            {props.publishing ? '발행 중…' : '발행'}
          </button>

          {props.kind === 'note' && (
            <p className="rounded-md bg-bg-card px-3 py-2 text-xs text-text-secondary">
              노트는 제목·설명·카테고리가 선택입니다. 본문만 있으면 발행할 수 있습니다.
            </p>
          )}
          {props.kind === 'project' && (
            <p className="rounded-md bg-bg-card px-3 py-2 text-xs text-text-secondary">
              프로젝트 글은 카테고리가 선택입니다. 연재 칸에 프로젝트 key, 순서에 Part 번호를 씁니다. 주소는
              /projects/&lt;key&gt;/&lt;slug&gt;입니다.
            </p>
          )}

          <Field label="설명" issue={issues.description}>
            <textarea
              className={`${inputClass} min-h-[72px] resize-y`}
              value={meta.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder="목록과 공유 카드에 보이는 한두 문장"
            />
          </Field>

          <Field label="slug" issue={issues.slug}>
            <div className="flex gap-1">
              <input
                className={inputClass}
                value={meta.slug}
                onChange={(event) => onChange({ slug: event.target.value })}
                placeholder="react-19-use-optimistic"
                spellCheck={false}
              />
              <button
                type="button"
                className="shrink-0 rounded-md border border-border px-2 text-xs text-text-secondary hover:text-text-primary"
                onClick={() => onChange({ slug: suggestSlug(meta.title) })}
                title="제목에서 slug를 제안한다"
              >
                제목에서
              </button>
            </div>
          </Field>

          <Field label="카테고리" issue={issues.category}>
            <select
              className={inputClass}
              value={meta.category ?? ''}
              onChange={(event) => onChange({ category: event.target.value || null })}
            >
              <option value="">없음</option>
              {categories.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
              {unknownCategory && (
                <option value={unknownCategory}>
                  {options ? `${unknownCategory} (목록에 없음)` : unknownCategory}
                </option>
              )}
            </select>
            {options && newCategory === null && (
              <button
                type="button"
                className="min-h-9 text-xs text-text-secondary hover:text-text-primary"
                onClick={() => {
                  setCategoryError(null);
                  setNewCategory({ label: '', key: '' });
                }}
              >
                + 새 카테고리
              </button>
            )}
            {newCategory && (
              <div className="space-y-1 rounded-md border border-border p-2">
                <div className="flex gap-1">
                  <input
                    className={`${fieldClass} min-w-0 flex-1`}
                    value={newCategory.label}
                    onChange={(event) => setNewCategory({ ...newCategory, label: event.target.value })}
                    placeholder="이름"
                    aria-label="새 카테고리 이름"
                  />
                  <input
                    className={`${fieldClass} min-w-0 flex-1`}
                    value={newCategory.key}
                    onChange={(event) => setNewCategory({ ...newCategory, key: event.target.value.toLowerCase() })}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void submitNewCategory();
                      }
                    }}
                    placeholder="주소 key"
                    aria-label="새 카테고리 주소 key"
                    spellCheck={false}
                  />
                </div>
                {categoryError && (
                  <p className="text-xs text-red-400" role="alert">
                    {categoryError}
                  </p>
                )}
                <div className="flex justify-end gap-2 text-xs">
                  <button type="button" className="min-h-9 px-2 text-text-secondary hover:text-text-primary" onClick={() => setNewCategory(null)} disabled={categoryBusy}>
                    취소
                  </button>
                  <button type="button" className="min-h-9 px-2 font-semibold text-brand" onClick={() => void submitNewCategory()} disabled={categoryBusy}>
                    {categoryBusy ? '만드는 중…' : '만들기'}
                  </button>
                </div>
              </div>
            )}
          </Field>

          <Field label={`태그 (${meta.tags.length}/${MAX_TAGS})`} issue={issues.tags}>
            <div className="flex flex-wrap gap-1">
              {meta.tags.map((tag) => (
                <span key={tag} className="tag tag-sm">
                  {tag}
                  <button
                    type="button"
                    aria-label={`태그 ${tag} 삭제`}
                    onClick={() => onChange({ tags: meta.tags.filter((item) => item !== tag) })}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <input
              className={inputClass}
              value={tagInput}
              disabled={meta.tags.length >= MAX_TAGS}
              onChange={(event) => setTagInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  addTag();
                }
              }}
              onBlur={() => tagInput.trim() && addTag()}
              placeholder={meta.tags.length >= MAX_TAGS ? '태그는 3개까지' : 'Enter로 추가'}
              list={`${listId}-tags`}
            />
            <datalist id={`${listId}-tags`}>
              {tagSuggestions.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </Field>

          <Field label="연재" issue={issues.series}>
            <div className="flex gap-1">
              <input
                className={`${fieldClass} min-w-0 flex-1`}
                value={seriesKey}
                // 연재 key는 영문 소문자만 받는다. 대문자는 입력할 때 바꾼다
                onChange={(event) => updateSeries(event.target.value.toLowerCase(), seriesOrder)}
                placeholder="연재 key (영문 소문자·숫자·-)"
                spellCheck={false}
                list={`${listId}-series`}
              />
              <datalist id={`${listId}-series`}>
                {(options?.series ?? []).map((series) => (
                  <option key={series.key} value={series.key}>
                    {`${series.title ?? '제목 없음'}${series.project ? ' · 프로젝트' : ''}`}
                  </option>
                ))}
              </datalist>
              <input
                className={`${fieldClass} w-16 shrink-0`}
                type="number"
                min={1}
                value={seriesOrder}
                disabled={!seriesKey}
                onChange={(event) => updateSeries(seriesKey, Number(event.target.value))}
                aria-label="연재 순서"
              />
            </div>
          </Field>

          <Field label="표지" issue={issues.cover}>
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="cover"
                  checked={!showCoverUpload}
                  onChange={() => {
                    setPickingCoverImage(false);
                    onChange({ cover: { kind: 'generated' } });
                  }}
                />
                생성
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  name="cover"
                  checked={showCoverUpload}
                  onChange={() => setPickingCoverImage(true)}
                />
                이미지
              </label>
            </div>
            {showCoverUpload && (
              <div className="space-y-2">
                {meta.cover.kind === 'image' && meta.cover.url ? (
                  <img
                    src={meta.cover.url}
                    alt="표지"
                    className="aspect-video w-full rounded-md object-cover"
                  />
                ) : (
                  <p className="text-xs text-text-secondary">이미지를 올리면 표지가 됩니다.</p>
                )}
                <label className="inline-block cursor-pointer rounded-md border border-border px-2 py-1 text-xs text-text-secondary hover:text-text-primary">
                  {props.coverUploading
                    ? '올리는 중…'
                    : meta.cover.kind === 'image'
                      ? '다른 이미지'
                      : '이미지 올리기'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    disabled={props.coverUploading}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) props.onCoverFile(file);
                    }}
                  />
                </label>
              </div>
            )}
          </Field>

          {props.summary && (
            <div className="border-t border-border pt-4">
              <Outline summary={props.summary} onJump={props.onJumpToHeading} />
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
