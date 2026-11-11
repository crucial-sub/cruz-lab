// 분류 화면 /admin/taxonomy (재건 5단계 D1)
// - 카테고리: 만들기, 이름 바꾸기, 주소 key 바꾸기, 다른 카테고리로 합치기, 글 옮기기, 지우기(글 0편일 때만).
// - 태그: 이름 바꾸기·합치기(이미 있는 이름이면 합친다).
// - 글을 바꾸는 동작(key 바꾸기·합치기·글 옮기기·태그)은 먼저 시험 실행(dryRun)으로 대상 글 목록과 수를 보이고 확인을 받는다.
// - 동의어 태그는 보이기만 한다. 옛 key·옛 태그 별칭(옛 주소 301)도 보인다.
// - 바꾼 뒤 분류와 글 목록을 다시 받는다(글의 분류 칸이 바뀌었다). 다른 곳에서 먼저 바꿨으면(409) 다시 받으라고 알린다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiClientError } from '@/editor/state/api';
import { categoryPath, tagPath } from '@/lib/public-paths';
import type { CategoryOperation } from '@/lib/server/taxonomy-store';
import { normalizeTag } from '@/lib/taxonomy';
import { errorMessage, redirectIfUnauthorized, useAdmin } from '../app-context';
import { ConfirmDialog, FormDialog, inputClass, primaryButton, RowMenu, type MenuItem } from '../ui';
import { taxonomyApi, type AffectedEntry, type TaxonomyMutation, type TaxonomyView } from './taxonomy-api';

type Dialog =
  | { type: 'create' }
  | { type: 'rename'; key: string; label: string }
  | { type: 'rekey'; key: string; label: string }
  | { type: 'merge'; key: string; label: string }
  | { type: 'move'; key: string; label: string }
  | { type: 'delete'; key: string; label: string }
  | { type: 'tag'; tag: string };

interface PendingConfirm {
  title: string;
  lead: string;
  confirmLabel: string;
  danger: boolean;
  affected: AffectedEntry[];
  run: () => Promise<TaxonomyMutation>;
  done: string;
}

const STATUS_TEXT: Record<string, string> = { draft: '초안', published: '발행', hidden: '숨김' };

// 대상 글 목록(확인 창). 20편까지 보이고 나머지는 수만 보인다
function AffectedList({ affected }: { affected: AffectedEntry[] }) {
  if (affected.length === 0) return <p>바뀌는 글이 없습니다.</p>;
  const shown = affected.slice(0, 20);
  return (
    <div>
      <p className="font-semibold text-text-primary">대상 글 {affected.length}편</p>
      <ul className="mt-1 max-h-60 space-y-0.5 overflow-y-auto rounded-md border border-border p-2 text-xs">
        {shown.map((entry) => (
          <li key={entry.id} className="flex gap-2">
            <span className="shrink-0 text-text-secondary">{STATUS_TEXT[entry.status] ?? entry.status}</span>
            <span className="truncate text-text-primary">{entry.title || '(제목 없음)'}</span>
          </li>
        ))}
        {affected.length > shown.length && <li className="text-text-secondary">… 외 {affected.length - shown.length}편</li>}
      </ul>
    </div>
  );
}

export function TaxonomyScreen() {
  const { list, loadList, showToast } = useAdmin();
  const [view, setView] = useState<TaxonomyView | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // 입력 대화상자의 값
  const [fieldA, setFieldA] = useState('');
  const [fieldB, setFieldB] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    try {
      setView(await taxonomyApi.read());
      setPhase('ready');
      setLoadError(null);
    } catch (error) {
      if (redirectIfUnauthorized(error)) return;
      setLoadError(errorMessage(error));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void reload();
    void loadList();
  }, [reload, loadList]);

  const items = useMemo(() => (list.phase === 'ready' ? list.items : []), [list]);

  // "글 옮기기" 창을 목록보다 먼저 열었으면, 목록이 오면 그 카테고리 글을 모두 고른다(PR-B 리뷰 B7)
  const [moveTouched, setMoveTouched] = useState(false);
  const moveKey = dialog?.type === 'move' ? dialog.key : null;
  useEffect(() => {
    if (!moveKey || moveTouched || list.phase !== 'ready') return;
    setSelected(new Set(list.items.filter((item) => item.category === moveKey).map((item) => item.id)));
  }, [moveKey, moveTouched, list]);

  const openDialog = (next: Dialog) => {
    setFormError(null);
    setDialog(next);
    if (next.type === 'create') {
      setFieldA('');
      setFieldB('');
    } else if (next.type === 'rename') {
      setFieldA(next.label);
    } else if (next.type === 'rekey') {
      setFieldA(next.key);
    } else if (next.type === 'merge') {
      setFieldA('');
    } else if (next.type === 'move') {
      setFieldA('');
      setMoveTouched(false);
      setSelected(new Set(items.filter((item) => item.category === next.key).map((item) => item.id)));
    } else if (next.type === 'tag') {
      setFieldA(next.tag);
    }
  };

  const closeAll = () => {
    if (busy) return;
    setDialog(null);
    setConfirm(null);
    setFormError(null);
  };

  // 실패 처리: 401은 로그인 화면, 409 충돌은 다시 받기, 400 입력 오류는 대화상자 안에 보인다
  const handleError = (error: unknown, inForm: boolean) => {
    if (redirectIfUnauthorized(error)) return;
    if (error instanceof ApiClientError && error.code === 'TAXONOMY_CONFLICT') {
      showToast('error', '다른 곳에서 분류를 먼저 바꿨습니다. 새 값으로 다시 불러왔습니다.');
      setDialog(null);
      setConfirm(null);
      void reload();
      return;
    }
    if (inForm) setFormError(errorMessage(error));
    else showToast('error', errorMessage(error));
  };

  // 바꾼 뒤: 분류·목록을 다시 받고 알린다
  // - 목록은 늘 다시 받는다. 이름 바꾸기도 첫 화면의 카테고리 이름(categoryLabel)을 바꾼다(PR-B 리뷰 B2)
  const afterChange = async (result: TaxonomyMutation, message: string) => {
    setDialog(null);
    setConfirm(null);
    await Promise.all([reload(), loadList(true)]);
    const purgeNote = result.purge === 'failed' ? ' 공개 캐시 비우기에 실패했습니다(알림 띠에서 다시 비우세요).' : '';
    showToast(result.purge === 'failed' ? 'error' : 'success', `${message}${purgeNote}`);
  };

  // 바로 실행(대상 글이 없는 동작: 만들기, 이름 바꾸기)
  const runDirect = async (operation: CategoryOperation, message: string) => {
    if (!view) return;
    setBusy(true);
    setFormError(null);
    try {
      const result = await taxonomyApi.changeCategory(operation, view.version, false);
      await afterChange(result, message);
    } catch (error) {
      handleError(error, true);
    } finally {
      setBusy(false);
    }
  };

  // 시험 실행 → 확인 창
  const preview = async (
    dryRun: () => Promise<TaxonomyMutation>,
    run: () => Promise<TaxonomyMutation>,
    texts: Omit<PendingConfirm, 'affected' | 'run'>,
  ) => {
    setBusy(true);
    setFormError(null);
    try {
      const result = await dryRun();
      setDialog(null);
      setConfirm({ ...texts, affected: result.affected, run });
    } catch (error) {
      handleError(error, true);
    } finally {
      setBusy(false);
    }
  };

  const runConfirmed = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      const result = await confirm.run();
      await afterChange(result, confirm.done);
    } catch (error) {
      setConfirm(null);
      handleError(error, false);
    } finally {
      setBusy(false);
    }
  };

  const submitDialog = () => {
    if (!dialog || !view) return;
    const version = view.version;
    switch (dialog.type) {
      case 'create':
        void runDirect({ op: 'create', label: fieldA, key: fieldB.trim() }, `카테고리 "${fieldA.trim()}"를 만들었습니다.`);
        return;
      case 'rename':
        void runDirect({ op: 'rename', key: dialog.key, label: fieldA }, `이름을 "${fieldA.trim()}"(으)로 바꿨습니다.`);
        return;
      case 'rekey': {
        // 이미 있는 key면 막는다(합치기는 따로 있다, PR-B 리뷰 B1). 서버도 400으로 거절한다
        if (view.categories.some((category) => category.key === fieldA.trim() && category.key !== dialog.key)) {
          setFormError('이미 있는 key입니다. 합치려면 "다른 카테고리로 합치기"를 쓰세요.');
          return;
        }
        const operation: CategoryOperation = { op: 'rekey', key: dialog.key, newKey: fieldA.trim() };
        void preview(
          () => taxonomyApi.changeCategory(operation, version, true),
          () => taxonomyApi.changeCategory(operation, version, false),
          {
            title: '주소 key 바꾸기',
            lead: `${dialog.label}: ${dialog.key} → ${fieldA.trim()}. 대상 글의 초안·발행본 key를 함께 바꿉니다. 옛 주소는 새 주소로 넘깁니다(301).`,
            confirmLabel: '바꾸기',
            danger: false,
            done: '주소 key를 바꿨습니다.',
          },
        );
        return;
      }
      case 'merge': {
        const target = view.categories.find((category) => category.key === fieldA);
        if (!target) {
          setFormError('합칠 카테고리를 고르세요.');
          return;
        }
        const operation: CategoryOperation = { op: 'merge', key: dialog.key, into: target.key };
        void preview(
          () => taxonomyApi.changeCategory(operation, version, true),
          () => taxonomyApi.changeCategory(operation, version, false),
          {
            title: '카테고리 합치기',
            lead: `${dialog.label}의 글을 ${target.label}(으)로 옮기고 ${dialog.label}을(를) 지웁니다. 옛 주소는 ${target.label} 주소로 넘깁니다(301).`,
            confirmLabel: '합치기',
            danger: true,
            done: `${dialog.label}을(를) ${target.label}에 합쳤습니다.`,
          },
        );
        return;
      }
      case 'move': {
        const target = view.categories.find((category) => category.key === fieldA);
        if (!target) {
          setFormError('옮길 카테고리를 고르세요.');
          return;
        }
        const ids = [...selected];
        if (ids.length === 0) {
          setFormError('옮길 글을 고르세요.');
          return;
        }
        const operation: CategoryOperation = { op: 'move', ids, to: target.key };
        void preview(
          () => taxonomyApi.changeCategory(operation, version, true),
          () => taxonomyApi.changeCategory(operation, version, false),
          {
            title: '글 옮기기',
            lead: `고른 글을 ${target.label}(으)로 옮깁니다. 초안과 발행본의 카테고리를 함께 바꿉니다. 새 판은 만들지 않습니다.`,
            confirmLabel: '옮기기',
            danger: false,
            done: `글을 ${target.label}(으)로 옮겼습니다.`,
          },
        );
        return;
      }
      case 'delete': {
        const operation: CategoryOperation = { op: 'delete', key: dialog.key };
        void preview(
          () => taxonomyApi.changeCategory(operation, version, true),
          () => taxonomyApi.changeCategory(operation, version, false),
          {
            title: '카테고리 지우기',
            lead: `${dialog.label}(${dialog.key})을(를) 지웁니다. 이 카테고리를 쓰는 글이 없습니다.`,
            confirmLabel: '지우기',
            danger: true,
            done: `${dialog.label}을(를) 지웠습니다.`,
          },
        );
        return;
      }
      case 'tag': {
        const from = dialog.tag;
        const to = fieldA;
        // 확인 창에는 서버가 쓸 값(코드 규칙으로 정규화한 이름)을 보인다
        const shown = normalizeTag(to);
        void preview(
          () => taxonomyApi.renameTag(from, to, version, true),
          () => taxonomyApi.renameTag(from, to, version, false),
          {
            title: '태그 바꾸기',
            lead: `${from} → ${shown}. 대상 글의 초안·발행본 태그를 함께 바꿉니다. 이미 있는 태그면 합칩니다. 옛 태그 주소는 새 주소로 넘깁니다(301).`,
            confirmLabel: '바꾸기',
            danger: false,
            done: `태그 ${from}을(를) 바꿨습니다.`,
          },
        );
        return;
      }
    }
  };

  const categoryMenu = (category: TaxonomyView['categories'][number]): MenuItem[] => {
    const base = { key: category.key, label: category.label };
    const menu: MenuItem[] = [
      { label: '이름 바꾸기', onSelect: () => openDialog({ type: 'rename', ...base }) },
      { label: '주소 key 바꾸기', onSelect: () => openDialog({ type: 'rekey', ...base }) },
      { label: '다른 카테고리로 합치기', onSelect: () => openDialog({ type: 'merge', ...base }) },
      { label: '글 옮기기', onSelect: () => openDialog({ type: 'move', ...base }) },
    ];
    if (category.publishedCount > 0) menu.push({ label: '공개 목록 보기', href: categoryPath(category.key), external: true });
    if (category.entryCount === 0) menu.push({ label: '지우기', danger: true, onSelect: () => openDialog({ type: 'delete', ...base }) });
    return menu;
  };

  const otherCategories = (key: string) => (view?.categories ?? []).filter((category) => category.key !== key);

  const renderDialog = () => {
    if (!dialog || !view) return null;
    const common = { busy, error: formError, onSubmit: submitDialog, onCancel: closeAll };
    switch (dialog.type) {
      case 'create':
        return (
          <FormDialog title="새 카테고리" submitLabel="만들기" {...common}>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">이름</span>
              <input className={inputClass} value={fieldA} onChange={(event) => setFieldA(event.target.value)} placeholder="예: 데이터베이스" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">주소 key</span>
              <input
                className={inputClass}
                value={fieldB}
                onChange={(event) => setFieldB(event.target.value.toLowerCase())}
                placeholder="예: database"
                spellCheck={false}
              />
              <span className="block text-xs">주소: /blog/category/{fieldB.trim() || '<key>'} · 영문 소문자·숫자를 -로 잇습니다</span>
            </label>
          </FormDialog>
        );
      case 'rename':
        return (
          <FormDialog title={`이름 바꾸기: ${dialog.label}`} submitLabel="바꾸기" {...common}>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">새 이름</span>
              <input className={inputClass} value={fieldA} onChange={(event) => setFieldA(event.target.value)} />
            </label>
            <p className="text-xs">주소 key({dialog.key})는 그대로입니다. 글은 바뀌지 않습니다.</p>
          </FormDialog>
        );
      case 'rekey':
        return (
          <FormDialog title={`주소 key 바꾸기: ${dialog.label}`} submitLabel="대상 글 보기" {...common}>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">새 주소 key</span>
              <input
                className={inputClass}
                value={fieldA}
                onChange={(event) => setFieldA(event.target.value.toLowerCase())}
                spellCheck={false}
              />
              <span className="block text-xs">/blog/category/{dialog.key} → /blog/category/{fieldA.trim() || '<key>'}</span>
            </label>
          </FormDialog>
        );
      case 'merge':
        return (
          <FormDialog title={`합치기: ${dialog.label}`} submitLabel="대상 글 보기" {...common}>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">합칠 카테고리(남는 쪽)</span>
              <select className={inputClass} value={fieldA} onChange={(event) => setFieldA(event.target.value)}>
                <option value="">고르세요</option>
                {otherCategories(dialog.key).map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label} ({category.key})
                  </option>
                ))}
              </select>
            </label>
          </FormDialog>
        );
      case 'move': {
        const candidates = items.filter((item) => item.category === dialog.key);
        return (
          <FormDialog title={`글 옮기기: ${dialog.label}`} submitLabel="대상 글 보기" wide {...common}>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">옮길 카테고리</span>
              <select className={inputClass} value={fieldA} onChange={(event) => setFieldA(event.target.value)}>
                <option value="">고르세요</option>
                {otherCategories(dialog.key).map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label} ({category.key})
                  </option>
                ))}
              </select>
            </label>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold">
                  옮길 글 ({selected.size}/{candidates.length})
                </span>
                <button
                  type="button"
                  className="min-h-9 px-2 text-brand"
                  onClick={() => {
                    setMoveTouched(true);
                    setSelected(selected.size === candidates.length ? new Set() : new Set(candidates.map((item) => item.id)));
                  }}
                >
                  {selected.size === candidates.length ? '모두 풀기' : '모두 고르기'}
                </button>
              </div>
              {list.phase === 'error' ? (
                <p className="mt-1 text-xs">
                  글 목록을 받지 못했습니다. {list.message}{' '}
                  <button type="button" className="min-h-9 px-1 text-brand" onClick={() => void loadList(true)}>
                    다시 받기
                  </button>
                </p>
              ) : list.phase !== 'ready' ? (
                <p className="mt-1 text-xs">글 목록을 불러오는 중…</p>
              ) : candidates.length === 0 ? (
                <p className="mt-1 text-xs">초안 기준으로 이 카테고리의 글이 없습니다.</p>
              ) : (
                <ul className="mt-1 max-h-64 overflow-y-auto rounded-md border border-border p-1">
                  {candidates.map((item) => (
                    <li key={item.id}>
                      <label className="flex min-h-9 items-center gap-2 rounded px-1 text-sm text-text-primary hover:bg-bg-card">
                        <input
                          type="checkbox"
                          checked={selected.has(item.id)}
                          onChange={(event) => {
                            setMoveTouched(true);
                            const next = new Set(selected);
                            if (event.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            setSelected(next);
                          }}
                        />
                        <span className="shrink-0 text-text-secondary">{STATUS_TEXT[item.status]}</span>
                        <span className="truncate">{item.title || '(제목 없음)'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </FormDialog>
        );
      }
      case 'delete':
        return (
          <FormDialog title={`지우기: ${dialog.label}`} submitLabel="확인" {...common}>
            <p>글이 0편인 카테고리만 지울 수 있습니다. 옛 주소 별칭 중 이 카테고리로 가던 줄도 지웁니다.</p>
          </FormDialog>
        );
      case 'tag': {
        const others = view.tags.filter((row) => row.tag !== dialog.tag);
        return (
          <FormDialog title={`태그 바꾸기: ${dialog.tag}`} submitLabel="대상 글 보기" {...common}>
            <label className="block space-y-1">
              <span className="text-xs font-semibold">새 이름 (이미 있는 태그면 합칩니다)</span>
              <input
                className={inputClass}
                value={fieldA}
                onChange={(event) => setFieldA(event.target.value)}
                list="taxonomy-tag-options"
                spellCheck={false}
              />
              <datalist id="taxonomy-tag-options">
                {others.map((row) => (
                  <option key={row.tag} value={row.tag} />
                ))}
              </datalist>
            </label>
          </FormDialog>
        );
      }
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">분류</h1>
          <p className="mt-1 text-sm text-text-secondary">카테고리와 태그를 만들고 바꿉니다. 바꾸면 글의 초안과 발행본이 함께 바뀝니다.</p>
        </div>
        {phase === 'ready' && (
          <button type="button" className={primaryButton} onClick={() => openDialog({ type: 'create' })}>
            새 카테고리
          </button>
        )}
      </div>

      {phase === 'loading' && <p className="py-12 text-center text-sm text-text-secondary">분류를 불러오는 중…</p>}
      {phase === 'error' && <p className="py-12 text-center text-sm text-text-secondary">분류를 받지 못했습니다. {loadError}</p>}

      {phase === 'ready' && view && (
        <>
          {!view.stored && (
            <p className="mt-4 rounded-md bg-bg-card px-3 py-2 text-xs text-text-secondary">
              아직 저장한 적이 없어 코드 기본값(카테고리 {view.categories.length}개)을 보입니다. 처음 바꾸면 이 값으로 저장됩니다.
            </p>
          )}
          {view.unknownCategories.length > 0 && (
            <p role="alert" className="mt-4 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              목록에 없는 카테고리 key를 쓰는 글이 있습니다: {view.unknownCategories.join(', ')}. 그 글을 열어 카테고리를 다시 고르세요.
            </p>
          )}

          <section className="mt-6" aria-labelledby="taxonomy-categories">
            <h2 id="taxonomy-categories" className="text-base font-semibold">
              카테고리 {view.categories.length}
            </h2>
            <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
              {view.categories.map((category) => (
                <li key={category.key} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-semibold text-text-primary">{category.label}</span>
                      <span className="text-xs text-text-secondary">{category.key}</span>
                    </div>
                    {category.synonymTags.length > 0 && (
                      <div className="mt-0.5 truncate text-xs text-text-secondary" title="이 태그는 이 카테고리로 바뀝니다">
                        동의어 태그: {category.synonymTags.join(', ')}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-text-secondary" title="초안을 포함한 글 수 · 공개 중인 글 수">
                    글 {category.entryCount} · 공개 {category.publishedCount}
                  </span>
                  <RowMenu label={`${category.label} 메뉴`} items={categoryMenu(category)} />
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-8" aria-labelledby="taxonomy-tags">
            <h2 id="taxonomy-tags" className="text-base font-semibold">
              태그 {view.tags.length}
            </h2>
            {view.tags.length === 0 ? (
              <p className="mt-2 text-sm text-text-secondary">태그가 없습니다.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
                {view.tags.map((row) => (
                  <li key={row.tag} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-medium text-text-primary">{row.tag}</span>
                    <span className="shrink-0 text-xs text-text-secondary">
                      글 {row.entryCount} · 공개 {row.publishedCount}
                    </span>
                    <RowMenu
                      label={`${row.tag} 메뉴`}
                      items={[
                        { label: '이름 바꾸기·합치기', onSelect: () => openDialog({ type: 'tag', tag: row.tag }) },
                        ...(row.publishedCount > 0 ? [{ label: '공개 목록 보기', href: tagPath(row.tag), external: true }] : []),
                      ]}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {(Object.keys(view.categoryAliases).length > 0 || Object.keys(view.tagAliases).length > 0) && (
            <section className="mt-8" aria-labelledby="taxonomy-aliases">
              <h2 id="taxonomy-aliases" className="text-base font-semibold">
                옛 주소
              </h2>
              <p className="mt-1 text-xs text-text-secondary">바꾸거나 합친 옛 key·태그입니다. 옛 주소로 오면 새 주소로 넘깁니다(301).</p>
              <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                {Object.entries(view.categoryAliases).map(([from, to]) => (
                  <li key={`c-${from}`}>
                    /blog/category/{from} → {to}
                  </li>
                ))}
                {Object.entries(view.tagAliases).map(([from, to]) => (
                  <li key={`t-${from}`}>
                    /blog/tag/{from} → {to}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {renderDialog()}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          busy={busy}
          onConfirm={() => void runConfirmed()}
          onCancel={closeAll}
        >
          <p>{confirm.lead}</p>
          <AffectedList affected={confirm.affected} />
          {confirm.affected.some((entry) => entry.status === 'published') && (
            <p className="text-xs">공개 글의 캐시를 비웁니다. 다른 지역의 캐시는 1분 안에 새로 고쳐집니다.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
