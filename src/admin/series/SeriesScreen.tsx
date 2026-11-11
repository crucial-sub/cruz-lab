// 연재·프로젝트 화면 /admin/series (재건 5단계 D2)
// - 목록: 프로젝트(대표 순서) 먼저, 그다음 연재. 제목(없으면 "제목 없음") · key · 편 수 · 공개 수 · 편 목록(에디터 링크).
// - 고치기: 제목·설명. 프로젝트면 긴 설명·태그·기술·GitHub·데모·대표·순서·기간(YYYY-MM)도.
// - 새 프로젝트: key·제목 → seriesMeta(project 칸) + 첫 Part 초안 → 에디터. 새 연재는 에디터에서 새 key를 쓰면 생긴다.
// - 지우기: 글이 0편인 연재·프로젝트 정보만(잘못 만든 프로젝트를 치운다).
// - 저장하면 그 연재의 공개 글과 목록 캐시를 비운다(서버). 다른 곳에서 먼저 바꿨으면(409) 다시 받는다.

import { useCallback, useEffect, useState } from 'react';
import { ApiClientError } from '@/editor/state/api';
import type { ProjectMeta } from '@/lib/entry-schema';
import { projectPath, seriesPath } from '@/lib/public-paths';
import type { SeriesRow } from '@/lib/server/admin-series';
import { errorMessage, redirectIfUnauthorized, useAdmin } from '../app-context';
import { preloadEditor } from '../editor-loader';
import { editPath } from '../router';
import { ConfirmDialog, FormDialog, inputClass, primaryButton, RowMenu, type MenuItem } from '../ui';
import { seriesApi } from './series-api';


const STATUS_TEXT: Record<string, string> = { draft: '초안', published: '발행', hidden: '숨김' };

interface EditForm {
  title: string;
  description: string;
  longDescription: string;
  tags: string;
  tech: string;
  github: string;
  demo: string;
  featured: boolean;
  order: string;
  startDate: string;
  endDate: string;
}

function formOf(row: SeriesRow): EditForm {
  const project = row.project;
  return {
    title: row.title ?? '',
    description: row.description,
    longDescription: project?.longDescription ?? '',
    tags: project?.tags.join(', ') ?? '',
    tech: project?.tech.join(', ') ?? '',
    github: project?.github ?? '',
    demo: project?.demo ?? '',
    featured: project?.featured ?? false,
    order: String(project?.order ?? 0),
    startDate: project?.startDate ?? '',
    endDate: project?.endDate ?? '',
  };
}

// 쉼표로 나눈 목록 (빈 값·중복 제거)
function splitList(value: string): string[] {
  return [...new Set(value.split(',').map((item) => item.trim()).filter(Boolean))];
}

// 폼 → 프로젝트 칸. 빈 선택 칸은 넣지 않는다(스키마의 optional)
function projectOf(form: EditForm): ProjectMeta {
  return {
    longDescription: form.longDescription.trim(),
    tags: splitList(form.tags),
    tech: splitList(form.tech),
    ...(form.github.trim() ? { github: form.github.trim() } : {}),
    ...(form.demo.trim() ? { demo: form.demo.trim() } : {}),
    featured: form.featured,
    order: Math.max(0, Math.floor(Number(form.order)) || 0),
    ...(form.startDate.trim() ? { startDate: form.startDate.trim() } : {}),
    ...(form.endDate.trim() ? { endDate: form.endDate.trim() } : {}),
  };
}

// 서버 검사 실패(400 details)를 한 줄로. message에 이미 있는 문구는 다시 붙이지 않는다(PR-B 리뷰 B8)
function describeError(error: unknown): string {
  if (error instanceof ApiClientError && Array.isArray(error.details)) {
    const parts = (error.details as Array<{ path?: string; field?: string; message?: string }>)
      .filter((issue) => !issue.message || !error.message.includes(issue.message))
      .map((issue) => [issue.path ?? issue.field, issue.message].filter(Boolean).join(': '))
      .filter(Boolean);
    if (parts.length > 0) return `${error.message} (${parts.join(', ')})`;
  }
  return errorMessage(error);
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold">{label}</span>
      {children}
      {hint && <span className="block text-xs">{hint}</span>}
    </label>
  );
}

export function SeriesScreen() {
  const { navigate, showToast, addItem } = useAdmin();
  const [rows, setRows] = useState<SeriesRow[]>([]);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ row: SeriesRow; form: EditForm } | null>(null);
  const [creating, setCreating] = useState<{ key: string; title: string } | null>(null);
  const [removing, setRemoving] = useState<SeriesRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows((await seriesApi.list()).items);
      setPhase('ready');
    } catch (error) {
      if (redirectIfUnauthorized(error)) return;
      setLoadError(errorMessage(error));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const fail = (error: unknown) => {
    if (redirectIfUnauthorized(error)) return;
    if (error instanceof ApiClientError && error.code === 'SERIES_CONFLICT') {
      showToast('error', '다른 곳에서 먼저 바꿨습니다. 새 값으로 다시 불러왔습니다.');
      setEditing(null);
      setRemoving(null);
      void reload();
      return;
    }
    setFormError(describeError(error));
  };

  const save = async () => {
    if (!editing) return;
    const { row, form } = editing;
    setBusy(true);
    setFormError(null);
    try {
      const result = await seriesApi.save(row.key, {
        baseVersion: row.version,
        title: form.title,
        description: form.description,
        project: row.project ? projectOf(form) : null,
      });
      setEditing(null);
      await reload();
      showToast(
        result.purge === 'failed' ? 'error' : 'success',
        result.purge === 'failed' ? '저장했습니다. 공개 캐시 비우기에 실패했습니다(알림 띠에서 다시 비우세요).' : '저장했습니다.',
      );
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!creating) return;
    setBusy(true);
    setFormError(null);
    preloadEditor();
    try {
      const created = await seriesApi.createProject(creating.key.trim(), creating.title);
      addItem(created.id, 'project', { key: created.key, order: 1 });
      setCreating(null);
      navigate(editPath(created.id));
    } catch (error) {
      fail(error);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      await seriesApi.remove(removing.key, removing.version);
      setRemoving(null);
      await reload();
      showToast('success', '연재 정보를 지웠습니다.');
    } catch (error) {
      setRemoving(null);
      if (!redirectIfUnauthorized(error)) showToast('error', describeError(error));
    } finally {
      setBusy(false);
    }
  };

  const menuOf = (row: SeriesRow): MenuItem[] => {
    const menu: MenuItem[] = [
      {
        label: '정보 고치기',
        onSelect: () => {
          setFormError(null);
          setEditing({ row, form: formOf(row) });
        },
      },
    ];
    if (row.publishedCount > 0) {
      menu.push({
        label: '공개 페이지 보기',
        href: row.project ? projectPath(row.key) : seriesPath(row.key),
        external: true,
      });
    }
    if (row.hasMeta && row.parts.length === 0) {
      menu.push({ label: '지우기', danger: true, onSelect: () => setRemoving(row) });
    }
    return menu;
  };

  const updateForm = (patch: Partial<EditForm>) => setEditing((current) => (current ? { ...current, form: { ...current.form, ...patch } } : current));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">연재·프로젝트</h1>
          <p className="mt-1 text-sm text-text-secondary">
            제목·설명과 프로젝트 정보를 고칩니다. 새 연재는 에디터의 연재 칸에 새 key를 쓰면 생깁니다.
          </p>
        </div>
        {phase === 'ready' && (
          <button
            type="button"
            className={primaryButton}
            onClick={() => {
              setFormError(null);
              setCreating({ key: '', title: '' });
            }}
          >
            새 프로젝트
          </button>
        )}
      </div>

      {phase === 'loading' && <p className="py-12 text-center text-sm text-text-secondary">불러오는 중…</p>}
      {phase === 'error' && <p className="py-12 text-center text-sm text-text-secondary">목록을 받지 못했습니다. {loadError}</p>}
      {phase === 'ready' && rows.length === 0 && <p className="py-12 text-center text-sm text-text-secondary">연재가 없습니다.</p>}
      {phase === 'ready' && rows.length > 0 && (
        <ul className="mt-5 divide-y divide-border border-y border-border text-sm">
          {rows.map((row) => (
            <li key={row.key} className="py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className={row.title ? 'font-semibold text-text-primary' : 'font-semibold text-amber-600 dark:text-amber-400'}>
                      {row.title ?? '제목 없음'}
                    </span>
                    <span className="text-xs text-text-secondary">{row.key}</span>
                    <span className="rounded-pill bg-bg-card px-2 py-0.5 text-xs text-text-secondary">{row.project ? '프로젝트' : '연재'}</span>
                    {row.project?.featured && <span className="text-xs text-text-secondary">대표</span>}
                  </div>
                  {row.description && <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{row.description}</p>}
                  {row.parts.length > 0 && (
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-text-secondary">
                        {row.parts.length}편 · 공개 {row.publishedCount}
                      </summary>
                      <ol className="mt-1 space-y-0.5">
                        {row.parts.map((part) => (
                          <li key={part.id} className="flex gap-2">
                            <span className="w-6 shrink-0 text-right text-text-secondary">{part.order}</span>
                            <span className="shrink-0 text-text-secondary">{STATUS_TEXT[part.status] ?? part.status}</span>
                            <a href={editPath(part.id)} className="truncate text-text-primary hover:underline">
                              {part.title || '(제목 없음)'}
                            </a>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {row.parts.length === 0 && <p className="mt-1 text-xs text-text-secondary">글 없음</p>}
                </div>
                <RowMenu label={`${row.title ?? row.key} 메뉴`} items={menuOf(row)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <FormDialog
          title={`${editing.row.project ? '프로젝트' : '연재'} 정보: ${editing.row.key}`}
          submitLabel="저장"
          wide
          busy={busy}
          error={formError}
          onSubmit={() => void save()}
          onCancel={() => !busy && setEditing(null)}
        >
          <Field label="제목">
            <input className={inputClass} value={editing.form.title} onChange={(event) => updateForm({ title: event.target.value })} />
          </Field>
          <Field label="설명" hint={editing.row.project ? '프로젝트 카드에 보입니다' : '/series 머리에 보입니다'}>
            <textarea
              className={`${inputClass} min-h-[64px] resize-y`}
              value={editing.form.description}
              onChange={(event) => updateForm({ description: event.target.value })}
            />
          </Field>
          {editing.row.project && (
            <>
              <Field label="긴 설명" hint="프로젝트 첫 Part 머리에 보입니다(마크다운)">
                <textarea
                  className={`${inputClass} min-h-[96px] resize-y`}
                  value={editing.form.longDescription}
                  onChange={(event) => updateForm({ longDescription: event.target.value })}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="태그" hint="쉼표로 나눕니다">
                  <input className={inputClass} value={editing.form.tags} onChange={(event) => updateForm({ tags: event.target.value })} />
                </Field>
                <Field label="기술" hint="쉼표로 나눕니다">
                  <input className={inputClass} value={editing.form.tech} onChange={(event) => updateForm({ tech: event.target.value })} />
                </Field>
                <Field label="GitHub 주소">
                  <input
                    className={inputClass}
                    type="url"
                    value={editing.form.github}
                    onChange={(event) => updateForm({ github: event.target.value })}
                    placeholder="https://github.com/…"
                  />
                </Field>
                <Field label="데모 주소">
                  <input
                    className={inputClass}
                    type="url"
                    value={editing.form.demo}
                    onChange={(event) => updateForm({ demo: event.target.value })}
                    placeholder="https://…"
                  />
                </Field>
                <Field label="시작 (YYYY-MM)">
                  <input
                    className={inputClass}
                    value={editing.form.startDate}
                    onChange={(event) => updateForm({ startDate: event.target.value })}
                    placeholder="2025-03"
                  />
                </Field>
                <Field label="끝 (YYYY-MM)">
                  <input
                    className={inputClass}
                    value={editing.form.endDate}
                    onChange={(event) => updateForm({ endDate: event.target.value })}
                    placeholder="비우면 진행 중"
                  />
                </Field>
                <Field label="순서" hint="작을수록 앞입니다">
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    value={editing.form.order}
                    onChange={(event) => updateForm({ order: event.target.value })}
                  />
                </Field>
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={editing.form.featured}
                    onChange={(event) => updateForm({ featured: event.target.checked })}
                  />
                  대표 프로젝트
                </label>
              </div>
            </>
          )}
        </FormDialog>
      )}

      {creating && (
        <FormDialog
          title="새 프로젝트"
          submitLabel="만들고 첫 Part 쓰기"
          busy={busy}
          error={formError}
          onSubmit={() => void create()}
          onCancel={() => !busy && setCreating(null)}
        >
          <Field label="제목">
            <input
              className={inputClass}
              value={creating.title}
              onChange={(event) => setCreating({ ...creating, title: event.target.value })}
              placeholder="예: Cruz Lab"
            />
          </Field>
          <Field label="key" hint={`주소: /projects/${creating.key.trim() || '<key>'} · 영문 소문자·숫자·-`}>
            <input
              className={inputClass}
              value={creating.key}
              onChange={(event) => setCreating({ ...creating, key: event.target.value.toLowerCase() })}
              spellCheck={false}
              placeholder="예: cruz-lab"
            />
          </Field>
          <p className="text-xs">첫 Part 초안을 만들고 에디터를 엽니다. 첫 Part를 발행하면 /projects에 보입니다.</p>
        </FormDialog>
      )}

      {removing && (
        <ConfirmDialog
          title="연재 정보 지우기"
          confirmLabel="지우기"
          danger
          busy={busy}
          onConfirm={() => void remove()}
          onCancel={() => !busy && setRemoving(null)}
        >
          <p>
            {removing.title ?? removing.key}({removing.key})의 정보를 지웁니다. 이 key를 쓰는 글이 없습니다. 되돌릴 수 없습니다.
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
