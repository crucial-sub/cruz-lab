// 설정 화면·에디터의 API 호출 (재건 5단계 D14)
// - 요청 함수는 에디터의 apiRequest를 쓴다(state/api.ts는 타입만 가져오므로 에디터 청크를 끌어오지 않는다).

import type { KeymapOverrides } from '@/editor/commands/keymap-settings';
import { apiRequest } from '@/editor/state/api';
import type { EditorSettingsState } from '@/lib/server/admin-settings';

export type { EditorSettingsState };

export const settingsApi = {
  readEditor: () => apiRequest<EditorSettingsState>('GET', '/api/admin/settings/editor'),
  saveEditor: (keymap: KeymapOverrides, baseVersion: number) =>
    apiRequest<EditorSettingsState>('PUT', '/api/admin/settings/editor', { keymap, baseVersion }),
};
