// 명령 "서가에 올리기" (서가 1단계 T9, Plan L2·J19)
// 1. Raycast를 열기 직전 맨 앞 앱이 Finder이고, Finder에서 고른 파일·폴더가 있으면 바로 올린다.
// 2. 그 밖에는 파일 고르기 칸을 연다(다른 앱이 앞에 있었으면 Finder에 남은 선택을 쓰지 않는다. lib/finder.ts).
// 3. 끝나면 올린 문서마다 QR·주소를 보인다. 알림(빠진 자산 등)과 실패도 함께 보인다.
// - 올리기 규칙은 lab push와 같다(공용 모듈 src/library/client/push.ts, lib/upload.ts).
// - 서가 2단계 J42: 폰에서 고친 판(아직 맥에 없음)이 있으면 확인 창으로 묻는다. "덮어쓰기"면 맥 원본으로 올린다.

import {
  Action,
  ActionPanel,
  Alert,
  confirmAlert,
  Detail,
  Form,
  getFrontmostApplication,
  getSelectedFinderItems,
  Icon,
  showToast,
  Toast,
} from '@raycast/api';
import { homedir } from 'node:os';
import { useEffect, useRef, useState } from 'react';
import { finderSelectionIfFrontmost } from './lib/finder';
import { uploadPaths, type UploadReport } from './lib/upload';
import { escapeMarkdown, qrDataUrl, SettingsProblem, useSettings } from './shared';

type Stage =
  | { kind: 'finding' } // Finder에서 고른 것을 찾는 중
  | { kind: 'pick' } // 파일 고르기 칸
  | { kind: 'uploading'; status: string }
  | { kind: 'done'; report: UploadReport; qrs: string[] }
  | { kind: 'error'; message: string };

// Finder에서 고른 경로. Raycast를 열기 직전 맨 앞 앱이 Finder가 아니거나 고른 것이 없으면 빈 목록
function finderSelection(): Promise<string[]> {
  return finderSelectionIfFrontmost({
    frontmostBundleId: async () => (await getFrontmostApplication()).bundleId,
    selectedPaths: async () => (await getSelectedFinderItems()).map((item) => item.path),
  });
}

// 결과 화면의 마크다운
function reportMarkdown(report: UploadReport, qrs: string[]): string {
  const parts: string[] = [];
  if (report.docs.length > 0) {
    parts.push(report.docs.length === 1 ? '# 서가에 올렸습니다' : `# 서가에 올렸습니다 (${report.docs.length}개)`);
    report.docs.forEach((doc, index) => {
      parts.push(`## ${escapeMarkdown(doc.title)}`, `![QR](${qrs[index]})`, `\`${doc.url}\``);
    });
  } else {
    parts.push('# 서가에 올리지 못했습니다');
  }
  // 공유 중인 묶음·문서에 들어갔다 (서가 2단계 J52)
  if (report.warnings.length > 0) parts.push('### 공유 중', ...report.warnings.map((line) => `- ${escapeMarkdown(line)}`));
  if (report.failures.length > 0) parts.push('### 실패', ...report.failures.map((line) => `- ${escapeMarkdown(line)}`));
  if (report.notes.length > 0) parts.push('### 알림', ...report.notes.map((line) => `- ${escapeMarkdown(line)}`));
  return parts.join('\n\n');
}

export default function Command() {
  const settings = useSettings();
  const [stage, setStage] = useState<Stage>({ kind: 'finding' });
  const started = useRef(false);

  async function upload(paths: string[]) {
    if (!settings.ok) return;
    setStage({ kind: 'uploading', status: '' });
    const toast = await showToast({ style: Toast.Style.Animated, title: '서가에 올리는 중' });
    try {
      const report = await uploadPaths(paths, {
        home: homedir(),
        server: settings.server,
        token: settings.token,
        onStatus: (status) => {
          toast.message = status;
          setStage({ kind: 'uploading', status });
        },
        confirmOverwrite: (fileName) =>
          confirmAlert({
            title: '폰에서 고친 판이 있습니다',
            message: `「${fileName}」은 폰에서 고친 글이 맥 원본에 아직 없습니다. 덮어쓰면 폰에서 고친 글이 서가에서 사라집니다. 먼저 가져오려면 "서가에서 가져오기"를 씁니다.`,
            icon: Icon.Warning,
            primaryAction: { title: '덮어쓰기', style: Alert.ActionStyle.Destructive },
            dismissAction: { title: '그만두기' },
          }),
      });
      const qrs = await Promise.all(report.docs.map((doc) => qrDataUrl(doc.url)));
      if (report.failures.length === 0) {
        toast.style = Toast.Style.Success;
        toast.title = '서가에 올렸습니다';
        toast.message = report.docs.length === 1 ? report.docs[0].title : `문서 ${report.docs.length}개`;
      } else {
        toast.style = Toast.Style.Failure;
        toast.title = report.docs.length > 0 ? `${report.docs.length}개 올림, ${report.failures.length}개 실패` : '서가 올리기 실패';
        toast.message = report.failures[0];
      }
      setStage({ kind: 'done', report, qrs });
    } catch (error) {
      // 계획 중 파일을 읽지 못한 경우 등 (서버 오류는 보고의 실패로 들어온다)
      const message = error instanceof Error ? error.message : String(error);
      toast.style = Toast.Style.Failure;
      toast.title = '서가 올리기 실패';
      toast.message = message;
      setStage({ kind: 'error', message });
    }
  }

  useEffect(() => {
    if (started.current || !settings.ok) return;
    started.current = true;
    finderSelection().then((paths) => {
      if (paths.length > 0) void upload(paths);
      else setStage({ kind: 'pick' });
    });
  }, []);

  if (!settings.ok) return <SettingsProblem message={settings.message} />;

  if (stage.kind === 'pick') {
    return (
      <Form
        navigationTitle="서가에 올리기"
        actions={
          <ActionPanel>
            <Action.SubmitForm
              title="서가에 올리기"
              icon={Icon.Upload}
              onSubmit={(values: { paths: string[] }) => {
                if (values.paths.length === 0) {
                  void showToast({ style: Toast.Style.Failure, title: '고른 문서가 없습니다' });
                  return;
                }
                void upload(values.paths);
              }}
            />
          </ActionPanel>
        }
      >
        <Form.Description text="md·html 파일이나 폴더째 문서를 고릅니다. Finder에서 먼저 고르고 이 명령을 열면 바로 올라갑니다." />
        <Form.FilePicker id="paths" title="문서" allowMultipleSelection canChooseDirectories canChooseFiles />
      </Form>
    );
  }

  if (stage.kind === 'done') {
    const { report, qrs } = stage;
    return (
      <Detail
        navigationTitle="서가에 올리기"
        markdown={reportMarkdown(report, qrs)}
        actions={
          <ActionPanel>
            {report.docs.map((doc) => (
              <ActionPanel.Section key={doc.id} title={doc.title}>
                <Action.CopyToClipboard title={report.docs.length === 1 ? '주소 복사' : `주소 복사: ${doc.title}`} content={doc.url} />
                <Action.OpenInBrowser title={report.docs.length === 1 ? '맥 브라우저에서 열기' : `열기: ${doc.title}`} url={doc.url} />
              </ActionPanel.Section>
            ))}
            {report.docs.length > 1 ? (
              <Action.CopyToClipboard
                title="주소 모두 복사"
                content={report.docs.map((doc) => doc.url).join('\n')}
                shortcut={{ modifiers: ['cmd', 'shift'], key: 'c' }}
              />
            ) : null}
          </ActionPanel>
        }
      />
    );
  }

  if (stage.kind === 'error') return <Detail markdown={`# 서가에 올리지 못했습니다\n\n${escapeMarkdown(stage.message)}`} />;

  // finding, uploading
  const status = stage.kind === 'uploading' && stage.status ? `\n\n${escapeMarkdown(stage.status)}` : '';
  return <Detail isLoading markdown={stage.kind === 'uploading' ? `# 서가에 올리는 중${status}` : ''} />;
}
