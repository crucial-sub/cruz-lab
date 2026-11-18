// 두 명령이 함께 쓰는 화면 부품 (서가 1단계 T9, Plan J19·J20)
// - 설정 읽기, 설정이 틀렸을 때의 화면, 서가 문서 QR 화면
// - QR에는 서가 문서 주소(J7)를 담는다. 아이폰 카메라로 찍으면 Safari에서 열린다.

import { Action, ActionPanel, Detail, getPreferenceValues, Icon, openExtensionPreferences } from '@raycast/api';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { readSettings, type Settings } from './lib/settings';

// package.json의 preferences와 같은 꼴
interface Preferences {
  token?: string;
  server?: string;
}

export function useSettings(): Settings {
  return readSettings(getPreferenceValues<Preferences>());
}

// 설정이 틀렸을 때: 이유와 설정 열기 단추
export function SettingsProblem({ message }: { message: string }) {
  return (
    <Detail
      markdown={`## 설정을 고쳐야 합니다\n\n${message}`}
      actions={
        <ActionPanel>
          <Action title="확장 설정 열기" icon={Icon.Gear} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    />
  );
}

// 주소 → QR 그림(PNG data URL). 어두운 화면에서도 찍히도록 흰 여백을 둔다
export function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 2, width: 300 });
}

// 마크다운 안 글 조각에서 표시 문자를 감싼다 (제목에 * _ ` [ ] 가 있어도 그대로 보이게)
export function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*_[\]#<>])/g, '\\$1');
}

// 서가 문서 하나의 QR 화면
export function QrDetail({ title, url }: { title: string; url: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    qrDataUrl(url).then(setImage, (reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)));
  }, [url]);

  const body = error ? `QR을 만들지 못했습니다: ${error}` : image ? `![QR](${image})` : '';
  return (
    <Detail
      isLoading={!image && !error}
      navigationTitle={`QR: ${title}`}
      markdown={`## ${escapeMarkdown(title)}\n\n${body}\n\n\`${url}\``}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="주소 복사" content={url} />
          <Action.OpenInBrowser title="맥 브라우저에서 열기" url={url} />
        </ActionPanel>
      }
    />
  );
}
