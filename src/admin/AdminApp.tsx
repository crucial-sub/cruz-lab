// 관리자 앱 루트 (재건 5단계 D9)
// - /admin/** 한 페이지([...path].astro)가 이 앱을 client:only로 띄운다. 미들웨어가 세션을 이미 확인했다.
// - 화면 전환은 History API로 주소만 바꾼다(router.ts). 같은 origin의 앱 주소 링크(<a href="/admin…">)는
//   문서 이동 대신 앱 안 이동으로 받는다. 에디터의 "← 목록"도 이 길로 온다.
// - 에디터는 늦게 받는다(React.lazy). 목록만 볼 때 에디터 청크를 받지 않는다.
// - 떠나기 가드: 에디터가 등록한다. 앱 안 이동·뒤로 가기 전에 부르고, false면 머문다(뒤로 가기는 주소를 되돌린다).
// - 목록 데이터는 앱이 한 번 받아 둔다. 에디터에서 돌아오면 다시 받지 않고, 에디터가 알린 값으로 그 줄만 고친다.
// - 관리자 표시(admin-hint.ts): 앱이 열리면 남기고 로그아웃하면 지운다(D4).

import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { EditorEntryUpdate, EditorHost } from '@/editor/ui/EditorApp';
import { redirectToLogin, ApiClientError } from '@/editor/state/api';
import type { EntryKind } from '@/lib/entry-schema';
import type { AdminListItem } from '@/lib/server/admin-entries';
import { clearAdminHint, writeAdminHint } from './admin-hint';
import { appApi } from './api';
import { AdminContext, errorMessage, type AdminContextValue, type ListLoad } from './app-context';
import { loadEditor, preloadEditor } from './editor-loader';
import { AssetsScreen } from './assets/AssetsScreen';
import { HomeScreen } from './home/HomeScreen';
import { AdminLayout } from './layout/AdminLayout';
import { LogScreen } from './log/LogScreen';
import { SeriesScreen } from './series/SeriesScreen';
import { SettingsScreen } from './settings/SettingsScreen';
import { TaxonomyScreen } from './taxonomy/TaxonomyScreen';
import {
  ADMIN_HOME_PATH,
  adminPathOf,
  documentTitleOf,
  isSameRoute,
  parseAdminPath,
  routeForLinkClick,
  type AdminRoute,
} from './router';
import { Toast, type ToastState } from './ui';

// 에디터 모듈. 첫 진입 때만 받는다(editor-loader.ts)
const LazyEditor = lazy(loadEditor);

// 에디터를 받지 못했을 때(네트워크, 새 배포로 옛 청크가 사라짐) 앱 전체가 빈 화면이 되지 않게 한다
class EditorLoadBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 px-4 text-center text-sm text-text-secondary">
        <p>에디터를 불러오지 못했습니다. 연결을 확인한 뒤 다시 불러오세요.</p>
        <div className="flex gap-3">
          <button type="button" className="text-brand" onClick={() => window.location.reload()}>
            다시 불러오기
          </button>
          <a href="/admin" className="text-text-primary">
            목록으로
          </a>
        </div>
      </div>
    );
  }
}

// 주소가 화면과 다르면 화면 주소로 바꾼다(기록을 더하지 않는다)
function syncUrlTo(route: AdminRoute): void {
  const target = adminPathOf(route);
  if (`${window.location.pathname}${window.location.search}` !== target) {
    window.history.replaceState(null, '', target);
  }
}

function currentRoute(): AdminRoute | null {
  return parseAdminPath(window.location.pathname, window.location.search);
}

const HOME: AdminRoute = { name: 'home', search: '' };

export default function AdminApp({ sessionExpiresAt }: { sessionExpiresAt: string | null }) {
  const [route, setRoute] = useState<AdminRoute>(() => currentRoute() ?? HOME);
  const [list, setList] = useState<ListLoad>({ phase: 'idle' });
  const [toast, setToast] = useState<ToastState | null>(null);
  const routeRef = useRef(route);
  routeRef.current = route;
  const guardRef = useRef<(() => Promise<boolean>) | null>(null);
  const navigatingRef = useRef(false);
  const listRequestRef = useRef<Promise<AdminListItem[] | null> | null>(null);
  const listRef = useRef(list);
  listRef.current = list;
  // 첫 화면의 마지막 거르기. 에디터의 "← 목록"(/admin)으로 돌아오면 같은 거르기다(D10 주소 상태)
  const lastHomeSearchRef = useRef(route.name === 'home' ? route.search : '');
  if (route.name === 'home') lastHomeSearchRef.current = route.search;

  // 모르는 주소로 열었으면 첫 화면으로 바꾼다
  useEffect(() => {
    if (!currentRoute()) window.history.replaceState(null, '', ADMIN_HOME_PATH);
  }, []);

  // 관리자 표시를 남긴다(세션 만료 시각까지)
  useEffect(() => {
    writeAdminHint(window.localStorage, sessionExpiresAt, Date.now());
  }, [sessionExpiresAt]);

  // 탭 제목
  useEffect(() => {
    document.title = documentTitleOf(route);
  }, [route]);

  const showToast = useCallback((tone: ToastState['tone'], message: string) => {
    setToast({ tone, message });
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  // 떠나기 가드를 통과하면 true
  const passGuard = useCallback(async (): Promise<boolean> => {
    const guard = guardRef.current;
    if (!guard) return true;
    try {
      return await guard();
    } catch {
      return window.confirm('저장 상태를 확인하지 못했습니다. 그래도 떠날까요?');
    }
  }, []);

  // 앱 안 이동
  const navigate = useCallback(
    async (path: string, options: { replace?: boolean } = {}) => {
      const url = new URL(path, window.location.origin);
      let next = parseAdminPath(url.pathname, url.search) ?? HOME;
      if (next.name === 'home' && !next.search && routeRef.current.name === 'edit') {
        next = { name: 'home', search: lastHomeSearchRef.current };
      }
      if (isSameRoute(next, routeRef.current)) return;
      if (navigatingRef.current) return;
      navigatingRef.current = true;
      try {
        if (!(await passGuard())) {
          // 머문다. 그사이 뒤로 가기로 주소가 바뀌었으면 지금 화면 주소로 되돌린다
          syncUrlTo(routeRef.current);
          return;
        }
        guardRef.current = null;
        const target = adminPathOf(next);
        if (options.replace) window.history.replaceState(null, '', target);
        else window.history.pushState(null, '', target);
        setRoute(next);
        window.scrollTo(0, 0);
      } finally {
        navigatingRef.current = false;
      }
    },
    [passGuard],
  );

  const replaceSearch = useCallback((search: string) => {
    const current = routeRef.current;
    if (current.name !== 'home') return;
    const next: AdminRoute = { name: 'home', search };
    if (isSameRoute(next, current)) return;
    try {
      window.history.replaceState(null, '', adminPathOf(next));
    } catch {
      // Safari는 짧은 시간에 replaceState를 너무 많이 부르면 SecurityError를 던진다(검색 칸 입력).
      // 주소만 늦게 맞고 화면 거르기는 그대로다. 다음 입력이 주소를 다시 쓴다
    }
    setRoute(next);
  }, []);

  // 뒤로·앞으로 가기. 가드가 막으면 주소를 지금 화면으로 되돌린다
  useEffect(() => {
    const onPopState = async () => {
      const next = currentRoute() ?? HOME;
      const previous = routeRef.current;
      if (isSameRoute(next, previous)) return;
      // 이동이 가드를 기다리는 중이면 이 뒤로 가기는 받지 않는다(가드가 두 번 돌지 않게).
      // 진행 중인 이동이 끝나면 주소를 그 결과 화면에 맞춘다
      if (navigatingRef.current) return;
      if (guardRef.current) {
        navigatingRef.current = true;
        const ok = await passGuard().finally(() => {
          navigatingRef.current = false;
        });
        if (!ok) {
          window.history.pushState(null, '', adminPathOf(previous));
          return;
        }
        guardRef.current = null;
      }
      setRoute(next);
      syncUrlTo(next);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [passGuard]);

  // 앱 주소 링크를 앱 안 이동으로 받는다
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.('a');
      if (!anchor) return;
      const target = routeForLinkClick({
        button: event.button,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        defaultPrevented: event.defaultPrevented,
        target: anchor.getAttribute('target'),
        download: anchor.hasAttribute('download'),
        href: anchor.href,
        currentOrigin: window.location.origin,
        currentPath: `${window.location.pathname}${window.location.search}`,
      });
      if (!target) return;
      event.preventDefault();
      void navigate(adminPathOf(target));
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [navigate]);

  // 목록을 받는다. 이미 받았으면 그대로 쓴다(force면 다시 받는다)
  // - force는 진행 중인 요청을 다시 쓰지 않는다. 그 요청은 바꾸기 전에 시작됐을 수 있다(PR-B 리뷰 B2).
  //   늦게 끝난 옛 요청이 새 결과를 덮지 않게 가장 최근 요청만 상태에 쓴다.
  const listSeqRef = useRef(0);
  const loadList = useCallback(
    async (force = false): Promise<AdminListItem[] | null> => {
      const known = listRef.current;
      if (!force && known.phase === 'ready') return known.items;
      if (!force && listRequestRef.current) return listRequestRef.current;
      if (!force) setList({ phase: 'loading' });
      const seq = ++listSeqRef.current;
      const request = appApi
        .listEntries()
        .then((response) => {
          if (seq === listSeqRef.current) setList({ phase: 'ready', items: response.items });
          return response.items;
        })
        .catch((error: unknown) => {
          if (error instanceof ApiClientError && error.status === 401) {
            redirectToLogin();
            return null;
          }
          if (!force) setList({ phase: 'error', message: errorMessage(error) });
          else showToast('error', `목록을 새로 받지 못했습니다 · ${errorMessage(error)}`);
          return null;
        })
        .finally(() => {
          if (listRequestRef.current === request) listRequestRef.current = null;
        });
      listRequestRef.current = request;
      return request;
    },
    [showToast],
  );

  const patchItem = useCallback((id: string, patch: Partial<AdminListItem>) => {
    setList((current) =>
      current.phase === 'ready'
        ? {
            phase: 'ready',
            items: current.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
          }
        : current,
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setList((current) =>
      current.phase === 'ready'
        ? { phase: 'ready', items: current.items.filter((item) => item.id !== id) }
        : current,
    );
  }, []);

  // 새 글을 만든 뒤 목록에 그 줄을 넣는다(다시 받지 않는다)
  // - 새 프로젝트(5단계 D2)는 첫 Part 초안의 연재 값을 함께 넣는다
  const addCreated = useCallback((id: string, kind: EntryKind, series: AdminListItem['series'] = null) => {
    const now = new Date().toISOString();
    setList((current) =>
      current.phase === 'ready'
        ? {
            phase: 'ready',
            items: [
              {
                id,
                kind,
                status: 'draft',
                title: '',
                slug: '',
                category: null,
                categoryLabel: null,
                tags: [],
                series,
                updatedAt: now,
                publishedAt: null,
                hasUnpublishedChanges: false,
                draftDevice: null,
                isEmptyDraft: true,
                readers30: null,
                publicPath: null,
              },
              ...current.items,
            ],
          }
        : current,
    );
  }, []);
  const addCreatedRef = useRef(addCreated);
  addCreatedRef.current = addCreated;

  const logout = useCallback(async () => {
    try {
      await appApi.logout();
    } catch {
      // 세션이 이미 끝났어도 로그인 화면으로 간다
    } finally {
      clearAdminHint(window.localStorage);
      window.location.assign('/admin/login');
    }
  }, []);

  const context = useMemo<AdminContextValue>(
    () => ({
      route,
      navigate: (path, options) => void navigate(path, options),
      replaceSearch,
      list,
      loadList,
      patchItem,
      removeItem,
      addItem: addCreated,
      showToast,
      logout,
      registerLeaveGuard: (guard) => {
        guardRef.current = guard;
      },
    }),
    [route, navigate, replaceSearch, list, loadList, patchItem, removeItem, addCreated, showToast, logout],
  );

  // 에디터 연결부. 한 번만 만든다(에디터가 다시 그려지지 않게)
  const contextRef = useRef(context);
  contextRef.current = context;
  const editorHost = useMemo<EditorHost>(
    () => ({
      navigate: (path) => void navigate(path),
      registerLeaveGuard: (guard) => {
        guardRef.current = guard;
      },
      onEntryChange: (update: EditorEntryUpdate) => {
        const { id, updatedAt, draftDevice, ...rest } = update;
        contextRef.current.patchItem(id, {
          ...rest,
          ...(updatedAt ? { updatedAt, draftDevice } : {}),
        });
      },
      onDeleted: (id) => contextRef.current.removeItem(id),
      logout: () => contextRef.current.logout(),
    }),
    [navigate],
  );

  // 새 글·오늘 기록: 빈 초안을 만들고 에디터로 간다(D10)
  const creatingRef = useRef(false);
  const createAndEdit = useCallback(
    async (kind: 'post' | 'note') => {
      if (creatingRef.current) return;
      creatingRef.current = true;
      preloadEditor();
      try {
        const created = await appApi.createEntry(kind);
        addCreatedRef.current(created.id, kind);
        await navigate(`/admin/edit/${encodeURIComponent(created.id)}`);
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) redirectToLogin();
        else
          showToast(
            'error',
            `새 ${kind === 'note' ? '노트' : '글'}를 만들지 못했습니다 · ${errorMessage(error)}`,
          );
      } finally {
        creatingRef.current = false;
      }
    },
    [navigate, showToast],
  );

  let screen: React.ReactNode;
  if (route.name === 'edit') {
    // 에디터는 메뉴 없이 전체 화면이다(D10). 글마다 새로 그린다(key)
    screen = (
      <EditorLoadBoundary key={route.id}>
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center text-sm text-text-secondary">
              에디터를 불러오는 중…
            </div>
          }
        >
          <LazyEditor key={route.id} entryId={route.id} host={editorHost} />
        </Suspense>
      </EditorLoadBoundary>
    );
  } else {
    const screens: Record<Exclude<AdminRoute['name'], 'edit'>, React.ReactNode> = {
      home: <HomeScreen onCreate={createAndEdit} />,
      assets: <AssetsScreen />,
      taxonomy: <TaxonomyScreen />,
      series: <SeriesScreen />,
      log: <LogScreen />,
      settings: <SettingsScreen />,
    };
    screen = (
      <AdminLayout current={route.name} onCreate={createAndEdit}>
        {screens[route.name]}
      </AdminLayout>
    );
  }

  return (
    <AdminContext.Provider value={context}>
      {screen}
      {toast && <Toast toast={toast} onClose={closeToast} />}
    </AdminContext.Provider>
  );
}
