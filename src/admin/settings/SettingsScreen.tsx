// 설정 화면: 에디터 키맵 (재건 5단계 D14)
// - 명령 묶음별 표: 명령 · 지금 키 · 기본 키 · 동작(바꾸기 · 지우기 · 기본값으로).
// - 이 기기의 플랫폼(맥 · 그 밖) 키만 고친다. 다른 플랫폼 키는 덮어쓰기 값 그대로 둔다.
// - "바꾸기"를 누르고 키를 누르면 잡는다(KeyCapture). 막는 키(Mod+Alt, 브라우저 키 등)는 그 줄에 이유를 보이고 받지 않는다.
// - 충돌은 저장 전에 그 줄을 빨갛게 보이고 저장 단추를 끈다. 서버도 같은 함수로 다시 검사한다(422).
// - 저장은 PUT { keymap, baseVersion }. 다른 곳에서 먼저 바꿨으면(409) 새 version과 서버 값을 받고, 화면에서 바꾼 값은 남긴다
//   (다시 저장하면 화면 값으로 덮는다). 저장된 문서가 깨졌으면(problem) 바꾼 것이 없어도 저장할 수 있다(리뷰 B2).
// - 저장하지 않은 변경이 있으면 앱 안 이동·탭 닫기 전에 묻는다(리뷰 B10).
// - 에디터는 열 때 한 번 읽는다. 바꾼 키는 다음에 여는 에디터부터 적용된다.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  COMMAND_GROUP_LABELS,
  COMMAND_SPECS,
  type CommandGroup,
  type CommandSpec,
} from '@/editor/commands/command-keys';
import { detectPlatform, formatKey, keyFor, type Platform } from '@/editor/commands/keymap';
import {
  checkOverrideKey,
  effectiveKeys,
  KEY_PROBLEM_MESSAGES,
  resetPlatformKey,
  setPlatformKey,
  validateKeymapOverrides,
  type KeymapIssue,
  type KeymapOverrides,
} from '@/editor/commands/keymap-settings';
import { ApiClientError } from '@/editor/state/api';
import { classNames } from '@/editor/ui/class-names';
import { errorMessage, redirectIfUnauthorized, useAdmin } from '../app-context';
import { primaryButton, quietButton, secondaryButton } from '../ui';
import { KeyCapture } from './KeyCapture';
import { settingsApi, type EditorSettingsState } from './settings-api';

const GROUP_ORDER: readonly CommandGroup[] = ['block', 'mark', 'insert', 'view', 'doc'];
const PLATFORM_LABELS: Record<Platform, string> = { mac: '맥', other: '윈도·리눅스' };

// 두 덮어쓰기가 같은지(키 순서와 상관없이)
function sameOverrides(a: KeymapOverrides, b: KeymapOverrides): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const id of keys) {
    const left = a[id];
    const right = b[id];
    if (left === undefined || right === undefined) return false;
    if (
      (left?.mac ?? null) !== (right?.mac ?? null) ||
      (left?.other ?? null) !== (right?.other ?? null)
    ) {
      return false;
    }
  }
  return true;
}

function KeyLabel({ keyString, platform }: { keyString: string | null; platform: Platform }) {
  if (!keyString) return <span className="text-text-secondary">없음</span>;
  return (
    <kbd className="rounded border border-border bg-bg-card px-1.5 py-0.5 font-mono text-xs text-text-primary">
      {formatKey(keyString, platform)}
    </kbd>
  );
}

export function SettingsScreen() {
  const { showToast, registerLeaveGuard } = useAdmin();
  const platform = useMemo(() => detectPlatform(navigator.platform), []);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saved, setSaved] = useState<EditorSettingsState | null>(null);
  const [draft, setDraft] = useState<KeymapOverrides>({});
  // 키를 잡는 중인 명령 id
  const [capturing, setCapturing] = useState<string | null>(null);
  // 받지 않은 키의 이유(명령 id → 문구)
  const [rejected, setRejected] = useState<Record<string, string>>({});
  // 서버가 돌려준 422 이유
  const [serverIssues, setServerIssues] = useState<KeymapIssue[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setPhase('loading');
    try {
      const state = await settingsApi.readEditor();
      setSaved(state);
      setDraft({ ...state.keymap });
      setRejected({});
      setServerIssues([]);
      setPhase('ready');
    } catch (error) {
      if (redirectIfUnauthorized(error)) return;
      setLoadError(errorMessage(error));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const effective = useMemo(
    () => new Map(effectiveKeys(draft).map((item) => [item.id, item])),
    [draft],
  );
  const issues = useMemo(
    () => [...validateKeymapOverrides(draft), ...serverIssues],
    [draft, serverIssues],
  );
  // 이 플랫폼 줄에 보일 이유(명령 id → 문구). 다른 플랫폼의 문제는 머리에 따로 보인다
  const rowIssues = useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of issues) {
      if (issue.platform === platform && !map.has(issue.id)) map.set(issue.id, issue.message);
    }
    return map;
  }, [issues, platform]);
  const otherPlatformIssues = issues.filter((issue) => issue.platform !== platform);
  // 깨진 문서는 서버가 빈 keymap을 준다. 화면 값이 같아도 저장해야 문서가 고쳐진다(리뷰 B2)
  const dirty = saved !== null && (!sameOverrides(draft, saved.keymap) || saved.problem !== null);
  const changed = saved !== null && !sameOverrides(draft, saved.keymap);

  // 저장하지 않은 변경: 앱 안 이동은 묻고, 탭을 닫으면 브라우저가 묻는다(리뷰 B10)
  useEffect(() => {
    if (!changed) return;
    registerLeaveGuard(async () =>
      window.confirm('저장하지 않은 키 설정이 있습니다. 버리고 떠날까요?'),
    );
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      registerLeaveGuard(null);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [changed, registerLeaveGuard]);

  const changeKey = (id: string, key: string | null) => {
    setDraft((current) => setPlatformKey(current, id, platform, key));
    setServerIssues([]);
    setRejected((current) =>
      Object.fromEntries(Object.entries(current).filter(([key]) => key !== id)),
    );
  };

  const onCapture = (spec: CommandSpec, key: string) => {
    setCapturing(null);
    const problem = checkOverrideKey(key, platform);
    if (problem) {
      setRejected((current) => ({
        ...current,
        [spec.id]: `${formatKey(key, platform)}: ${KEY_PROBLEM_MESSAGES[problem]}`,
      }));
      return;
    }
    changeKey(spec.id, key);
  };

  const resetThisPlatform = () => {
    setDraft((current) => {
      let next = current;
      for (const id of Object.keys(current)) next = resetPlatformKey(next, id, platform);
      return next;
    });
    setRejected({});
    setServerIssues([]);
  };

  // 화면에서 바꾼 것을 서버 값으로 되돌린다. 받지 않은 키·서버 이유도 지운다(리뷰 B16)
  const revertDraft = () => {
    if (!saved) return;
    setDraft({ ...saved.keymap });
    setRejected({});
    setServerIssues([]);
  };

  // 다른 플랫폼·모르는 명령의 문제 줄은 이 기기에서 고칠 수 없다. 그 줄의 덮어쓰기를 지운다(두 플랫폼 모두 기본값)
  const resetProblemRows = () => {
    const ids = new Set(otherPlatformIssues.map((issue) => issue.id));
    setDraft((current) =>
      Object.fromEntries(Object.entries(current).filter(([id]) => !ids.has(id))),
    );
    setServerIssues([]);
  };

  const save = async () => {
    if (!saved || issues.length > 0) return;
    setSaving(true);
    try {
      const next = await settingsApi.saveEditor(draft, saved.version);
      setSaved(next);
      setDraft({ ...next.keymap });
      setServerIssues([]);
      showToast('success', '키 설정을 저장했습니다. 다음에 여는 에디터부터 적용됩니다.');
    } catch (error) {
      if (redirectIfUnauthorized(error)) return;
      if (error instanceof ApiClientError && error.status === 409) {
        // 서버 값과 version만 새로 받는다. 화면에서 바꾼 값은 남긴다(리뷰 B10)
        try {
          setSaved(await settingsApi.readEditor());
          showToast(
            'error',
            '다른 곳에서 설정을 먼저 바꿨습니다. 화면 값으로 덮으려면 다시 저장하세요.',
          );
        } catch (reloadError) {
          if (!redirectIfUnauthorized(reloadError))
            showToast('error', `설정을 다시 받지 못했습니다. ${errorMessage(reloadError)}`);
        }
      } else if (
        error instanceof ApiClientError &&
        error.status === 422 &&
        Array.isArray(error.details)
      ) {
        setServerIssues(error.details as KeymapIssue[]);
        showToast('error', '키 설정에 문제가 있어 저장하지 않았습니다. 빨간 줄을 확인하세요.');
      } else {
        showToast('error', `저장하지 못했습니다. ${errorMessage(error)}`);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold">설정</h1>
      <p className="mt-1 text-sm text-text-secondary">
        에디터 단축키입니다. 이 기기({PLATFORM_LABELS[platform]})의 키만 바꿉니다. 바꾼 키는 다음에
        여는 에디터부터 적용됩니다.
      </p>

      {phase === 'loading' && (
        <p className="py-12 text-center text-sm text-text-secondary">설정을 불러오는 중…</p>
      )}
      {phase === 'error' && (
        <div className="py-12 text-center text-sm text-text-secondary">
          <p>설정을 받지 못했습니다. {loadError}</p>
          <button type="button" className={`${secondaryButton} mt-3`} onClick={() => void load()}>
            다시 불러오기
          </button>
        </div>
      )}

      {phase === 'ready' && saved && (
        <>
          {saved.problem === 'invalid' && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-red-500/60 px-3 py-2 text-sm text-red-600 dark:text-red-400"
            >
              저장된 키 설정이 깨져 에디터가 기본 키를 씁니다. 저장하면 지금 화면의 값으로
              고쳐집니다.
            </p>
          )}
          {otherPlatformIssues.length > 0 && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-red-500/60 px-3 py-2 text-sm text-red-600 dark:text-red-400"
            >
              <p>
                다른 플랫폼 키나 지금 없는 명령의 설정에 문제가 있습니다. 이 기기에서는 고칠 수
                없으니 그 줄을 기본값으로 되돌리세요.
              </p>
              <ul className="mt-1 list-disc pl-5">
                {otherPlatformIssues.map((issue) => (
                  <li key={`${issue.id}-${issue.platform ?? 'none'}-${issue.code}`}>
                    {COMMAND_SPECS.find((item) => item.id === issue.id)?.title ?? issue.id}
                    {issue.platform ? ` (${PLATFORM_LABELS[issue.platform]})` : ''}: {issue.message}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`${secondaryButton} mt-2`}
                onClick={resetProblemRows}
              >
                이 줄들을 기본값으로
              </button>
            </div>
          )}

          {/* 1024px 미만은 관리자 위 막대(h-12)가 위에 붙어 있다. 그 아래에 붙는다(리뷰 B8) */}
          <div className="sticky top-12 z-10 mt-4 flex flex-wrap items-center gap-2 border-b border-border bg-bg-app py-2 lg:top-0">
            <button
              type="button"
              className={primaryButton}
              disabled={!dirty || issues.length > 0 || saving}
              onClick={() => void save()}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              className={secondaryButton}
              disabled={!changed || saving}
              onClick={revertDraft}
            >
              바꾼 것 되돌리기
            </button>
            <button
              type="button"
              className={quietButton}
              disabled={saving}
              onClick={resetThisPlatform}
            >
              {PLATFORM_LABELS[platform]} 키 모두 기본값으로
            </button>
            {issues.length > 0 && (
              <span className="text-sm text-red-600 dark:text-red-400">
                문제 {issues.length}건을 고쳐야 저장됩니다
              </span>
            )}
          </div>

          {GROUP_ORDER.map((group) => {
            const specs = COMMAND_SPECS.filter((item) => item.group === group);
            return (
              <section key={group} className="mt-6">
                <h2 className="text-sm font-semibold text-text-secondary">
                  {COMMAND_GROUP_LABELS[group]}
                </h2>
                <ul className="mt-2 divide-y divide-border border-y border-border text-sm">
                  {specs.map((spec) => {
                    const current = keyFor(effective.get(spec.id) ?? spec, platform);
                    const fallback = keyFor(spec, platform);
                    const issue = rowIssues.get(spec.id) ?? null;
                    const reason = rejected[spec.id] ?? null;
                    return (
                      <li
                        key={spec.id}
                        className={classNames(
                          'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2 md:grid-cols-[minmax(0,1fr)_8rem_8rem_auto]',
                          issue && 'bg-red-500/10',
                        )}
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-text-primary">{spec.title}</span>
                          {(issue || reason) && (
                            <span
                              role="alert"
                              className="block text-xs text-red-600 dark:text-red-400"
                            >
                              {issue ?? reason}
                            </span>
                          )}
                        </span>
                        <span className="justify-self-end md:justify-self-start">
                          {capturing === spec.id ? (
                            <KeyCapture
                              platform={platform}
                              onCapture={(key) => onCapture(spec, key)}
                              onCancel={() => setCapturing(null)}
                            />
                          ) : (
                            <KeyLabel keyString={current} platform={platform} />
                          )}
                        </span>
                        <span className="text-xs text-text-secondary md:text-sm">
                          <span className="md:hidden">기본 </span>
                          <KeyLabel keyString={fallback} platform={platform} />
                        </span>
                        <span className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            className={quietButton}
                            onClick={() => setCapturing(capturing === spec.id ? null : spec.id)}
                            aria-label={`${spec.title} 키 바꾸기`}
                          >
                            바꾸기
                          </button>
                          <button
                            type="button"
                            className={quietButton}
                            disabled={current === null}
                            onClick={() => changeKey(spec.id, null)}
                            aria-label={`${spec.title} 키 지우기`}
                          >
                            지우기
                          </button>
                          <button
                            type="button"
                            className={quietButton}
                            disabled={current === fallback}
                            onClick={() => changeKey(spec.id, fallback)}
                            aria-label={`${spec.title} 키를 기본값으로`}
                          >
                            기본값으로
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
