// 명령 "서가에서 가져오기" (서가 2단계 T7, Plan J40·J43, L6)
// - 폰에서 고친 md(폰 판)가 있는 맥 문서를 최근 것부터 보인다(토큰 API ?pending=md).
// - ↵ 맥 원본에 되돌리기, ⌘⇧↵ 모두 되돌리기, ⌘O 맥 브라우저에서 열기, ⌘R 새로 고침.
// - 되돌리기 규칙은 lab pull과 같다(공용 모듈 src/library/client/pull.ts):
//   원본이 서가가 아는 내용일 때만 백업한 뒤 바꾼다. 아니면 원본을 두고 옆에 {이름}.phone.md를 만들고 차이를 보인다.
// - 결과 화면: 문서마다 결과 줄(lab pull과 같은 글, client/messages.ts), 원본·폰 판 파일 열기, Finder에서 보기.

import { Action, ActionPanel, Detail, Icon, List, showToast, Toast, useNavigation } from '@raycast/api';
import { homedir } from 'node:os';
import { useEffect, useState } from 'react';
import type { LibraryDocItem } from '../../../src/library/client/docs.ts';
import { describeApiError, describePullOutcome } from '../../../src/library/client/messages.ts';
import { backupDirFor, listPendingPulls, pullDoc, type PullOutcome } from '../../../src/library/client/pull.ts';
import { docMeta } from './lib/doc-meta';
import { RAYCAST_UNAUTHORIZED_HINT as UNAUTHORIZED_HINT } from './lib/settings';
import { escapeMarkdown, SettingsProblem, useSettings } from './shared';

const OUTCOME_TITLES: Record<PullOutcome['kind'], string> = {
  replaced: '되돌렸습니다',
  same: '이미 같습니다',
  conflict: '충돌: 원본을 두었습니다',
  skipped: '건너뛰었습니다',
  failed: '실패했습니다',
};

// 결과 화면의 마크다운: 문서마다 제목 한 줄 + 결과 줄(고정폭)
function reportMarkdown(outcomes: PullOutcome[]): string {
  if (outcomes.length === 0) return '# 되돌릴 폰 판이 없습니다';
  const home = homedir();
  return outcomes
    .map((outcome) => {
      const lines = describePullOutcome(outcome, home);
      return [`## ${OUTCOME_TITLES[outcome.kind]} — ${escapeMarkdown(outcome.title)}`, '```text', ...lines.slice(1), '```'].join('\n');
    })
    .join('\n\n');
}

// 결과 화면의 파일 동작 (원본, 폰 판, 백업)
function outcomeActions(outcome: PullOutcome) {
  const actions = [];
  if (outcome.kind === 'conflict') {
    actions.push(<Action.Open key="phone" title="폰 판 파일 열기" target={outcome.phonePath} icon={Icon.Mobile} />);
  }
  if (outcome.path && outcome.kind !== 'failed' && !(outcome.kind === 'skipped' && outcome.reason !== 'not-pending')) {
    actions.push(<Action.Open key="source" title="맥 원본 열기" target={outcome.path} icon={Icon.Document} />);
    actions.push(<Action.ShowInFinder key="finder" title="Finder에서 보기" path={outcome.path} />);
  }
  if (outcome.kind === 'replaced') {
    actions.push(<Action.ShowInFinder key="backup" title="앞 원본 백업 보기" path={outcome.backupPath} />);
  }
  return actions;
}

function ReportDetail({ outcomes }: { outcomes: PullOutcome[] }) {
  return (
    <Detail
      navigationTitle="서가에서 가져오기"
      markdown={reportMarkdown(outcomes)}
      actions={
        <ActionPanel>
          {outcomes.map((outcome, index) => (
            <ActionPanel.Section key={`${outcome.docId ?? 'x'}-${index}`} title={outcome.title}>
              {outcomeActions(outcome)}
            </ActionPanel.Section>
          ))}
        </ActionPanel>
      }
    />
  );
}

export default function Command() {
  const settings = useSettings();
  const { push } = useNavigation();
  const [docs, setDocs] = useState<LibraryDocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!settings.ok) return;
    setLoading(true);
    try {
      setDocs(await listPendingPulls({ server: settings.server, token: settings.token }));
      setError(null);
    } catch (reason) {
      const message = describeApiError(reason, settings.server, UNAUTHORIZED_HINT);
      setError(message);
      void showToast({ style: Toast.Style.Failure, title: '폰 판 목록을 읽지 못했습니다', message });
    } finally {
      setLoading(false);
    }
  }

  // 고른 문서들을 차례로 되돌리고 결과 화면을 연다
  async function pull(targets: LibraryDocItem[]) {
    if (!settings.ok || targets.length === 0) return;
    const home = homedir();
    const options = {
      server: settings.server,
      token: settings.token,
      home,
      backupDir: backupDirFor(home, new Date()),
      describeError: (reason: unknown) => describeApiError(reason, settings.server, UNAUTHORIZED_HINT),
    };
    const toast = await showToast({ style: Toast.Style.Animated, title: '가져오는 중' });
    const outcomes: PullOutcome[] = [];
    for (const [index, doc] of targets.entries()) {
      toast.message = `${doc.title} (${index + 1}/${targets.length})`;
      outcomes.push(await pullDoc(doc.id, options));
    }
    const bad = outcomes.filter((outcome) => outcome.kind === 'failed' || outcome.kind === 'conflict').length;
    toast.style = bad > 0 ? Toast.Style.Failure : Toast.Style.Success;
    toast.title = bad > 0 ? `확인할 문서 ${bad}개` : '가져왔습니다';
    toast.message = undefined;
    push(<ReportDetail outcomes={outcomes} />);
    await load();
  }

  useEffect(() => {
    void load();
  }, []);

  if (!settings.ok) return <SettingsProblem message={settings.message} />;

  return (
    <List isLoading={loading} navigationTitle="서가에서 가져오기" searchBarPlaceholder="제목·프로젝트로 거르기">
      {error ? (
        <List.EmptyView title="폰 판 목록을 읽지 못했습니다" description={error} icon={Icon.Warning} />
      ) : (
        <List.EmptyView title="되돌릴 폰 판이 없습니다" description="폰에서 고쳐 저장한 md가 여기에 보입니다." icon={Icon.Check} />
      )}
      {docs.map((doc) => (
        <List.Item
          key={doc.id}
          title={doc.title}
          subtitle={doc.project}
          keywords={[doc.project]}
          accessories={[{ text: docMeta(doc).date }, ...(doc.mdPendingRev ? [{ tag: `폰 판 ${doc.mdPendingRev}` }] : [])]}
          actions={
            <ActionPanel>
              <Action title="맥 원본에 되돌리기" icon={Icon.Download} onAction={() => void pull([doc])} />
              <Action
                title="모두 되돌리기"
                icon={Icon.Download}
                shortcut={{ modifiers: ['cmd', 'shift'], key: 'return' }}
                onAction={() => void pull(docs)}
              />
              <Action.OpenInBrowser title="맥 브라우저에서 열기" url={doc.url} shortcut={{ modifiers: ['cmd'], key: 'o' }} />
              <Action
                title="새로 고침"
                icon={Icon.ArrowClockwise}
                shortcut={{ modifiers: ['cmd'], key: 'r' }}
                onAction={() => void load()}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
