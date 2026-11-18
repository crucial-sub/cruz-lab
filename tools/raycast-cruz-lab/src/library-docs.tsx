// 명령 "서가 문서" (서가 1단계 T9, Plan J19·J20)
// - 서가 문서를 최근 것부터 보인다(서버 순서). 찾기 칸은 제목·프로젝트·형식으로 거른다.
// - 동작: 열기(↵, 맥 브라우저), QR 보기(⌘↵), 주소 복사(⌘⇧C), 내리기(⌃X, 확인 창 뒤), 새로 고침(⌘R).
// - 내리기는 서가 사본만 지운다. 맥의 원본 파일은 그대로다. 같은 파일을 다시 올리면 같은 주소로 돌아온다(J8, 문서 id는 원본 경로에서 정해진다).

import { Action, ActionPanel, Alert, Color, confirmAlert, Icon, Keyboard, List, showToast, Toast } from '@raycast/api';
import { useEffect, useState } from 'react';
import { listDocs, removeDoc, type LibraryDocItem } from '../../../src/library/client/docs.ts';
import { describeApiError } from '../../../src/library/client/messages.ts';
import { PushError } from '../../../src/library/client/push.ts';
import { docMeta } from './lib/doc-meta';
import { RAYCAST_UNAUTHORIZED_HINT as UNAUTHORIZED_HINT } from './lib/settings';
import { QrDetail, SettingsProblem, useSettings } from './shared';

export default function Command() {
  const settings = useSettings();
  const [docs, setDocs] = useState<LibraryDocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!settings.ok) return;
    setLoading(true);
    try {
      setDocs(await listDocs({ server: settings.server, token: settings.token }));
      setError(null);
    } catch (reason) {
      const message = describeApiError(reason, settings.server, UNAUTHORIZED_HINT);
      setError(message);
      void showToast({ style: Toast.Style.Failure, title: '서가 목록을 읽지 못했습니다', message });
    } finally {
      setLoading(false);
    }
  }

  async function remove(doc: LibraryDocItem) {
    if (!settings.ok) return;
    const confirmed = await confirmAlert({
      title: '서가에서 내릴까요?',
      message: `「${doc.title}」의 서가 사본을 지웁니다. 맥의 원본 파일은 그대로 있습니다. 같은 파일을 다시 올리면 같은 주소로 돌아옵니다.`,
      icon: Icon.Trash,
      primaryAction: { title: '내리기', style: Alert.ActionStyle.Destructive },
      dismissAction: { title: '그만두기' },
    });
    if (!confirmed) return;
    const toast = await showToast({ style: Toast.Style.Animated, title: '내리는 중', message: doc.title });
    try {
      await removeDoc({ server: settings.server, token: settings.token }, doc.id);
      toast.style = Toast.Style.Success;
      toast.title = '서가에서 내렸습니다';
    } catch (reason) {
      // 목록을 읽은 뒤의 404는 다른 입구가 먼저 내린 경우다. 목록만 고친다
      if (reason instanceof PushError && reason.status === 404) {
        toast.style = Toast.Style.Success;
        toast.title = '이미 내려간 문서입니다';
      } else {
        toast.style = Toast.Style.Failure;
        toast.title = '내리지 못했습니다';
        toast.message = describeApiError(reason, settings.server, UNAUTHORIZED_HINT);
        return;
      }
    }
    setDocs((current) => current.filter((item) => item.id !== doc.id));
  }

  useEffect(() => {
    void load();
  }, []);

  if (!settings.ok) return <SettingsProblem message={settings.message} />;

  const refresh = (
    <Action title="목록 새로 고침" icon={Icon.ArrowClockwise} shortcut={Keyboard.Shortcut.Common.Refresh} onAction={load} />
  );

  return (
    <List isLoading={loading} searchBarPlaceholder="제목·프로젝트로 찾기">
      {loading ? null : error ? (
        <List.EmptyView icon={Icon.Warning} title="서가 목록을 읽지 못했습니다" description={error} actions={<ActionPanel>{refresh}</ActionPanel>} />
      ) : (
        <List.EmptyView
          icon={Icon.Document}
          title="서가에 문서가 없습니다"
          description={'Raycast의 "서가에 올리기", Finder 빠른 동작, lab push로 올립니다.'}
          actions={<ActionPanel>{refresh}</ActionPanel>}
        />
      )}
      {docs.map((doc) => {
        const meta = docMeta(doc);
        return (
          <List.Item
            key={doc.id}
            icon={doc.unread ? { source: Icon.CircleFilled, tintColor: Color.Blue } : Icon.Document}
            title={doc.title}
            subtitle={doc.project}
            keywords={[doc.project, ...meta.formats.split('·')]}
            accessories={[
              ...(doc.unread ? [{ tag: { value: '새 문서', color: Color.Blue } }] : []),
              { text: meta.formats },
              { text: meta.date },
            ]}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action.OpenInBrowser title="맥 브라우저에서 열기" url={doc.url} />
                  <Action.Push title="QR 보기" icon={Icon.Mobile} target={<QrDetail title={doc.title} url={doc.url} />} />
                  <Action.CopyToClipboard title="주소 복사" content={doc.url} shortcut={Keyboard.Shortcut.Common.Copy} />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action
                    title="서가에서 내리기"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={Keyboard.Shortcut.Common.Remove}
                    onAction={() => remove(doc)}
                  />
                  {refresh}
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
