// 에디터 설정(키맵) 읽기·쓰기 (재건 5단계 D14)
// - settings/editor 문서: { keymap, version, updatedAt }. keymap은 기본값과 다른 명령만 담는다.
// - 문서가 없으면 version 0, 빈 keymap(모두 기본 키)이다.
// - 쓰기: 요청 값을 keymap-settings.ts로 검사한다(모르는 명령, 키 형식, Mod+Alt, 막는 키, 충돌 → 422 항목별 이유).
//   기본값과 같은 줄은 빼고 저장한다. 트랜잭션 안에서 version을 비교한다(다르면 409 SETTINGS_CONFLICT).
// - 읽기에서 문서가 스키마와 맞지 않으면 빈 keymap과 problem 'invalid'를 돌려준다. 에디터는 기본 키로 열고 띠로 알린다.

import { Timestamp, type DocumentData } from 'firebase-admin/firestore';
import {
  compactOverrides,
  validateKeymapOverrides,
  type KeymapOverrides,
} from '@/editor/commands/keymap-settings';
import { editorSettingsDocSchema, toDateValue } from '@/lib/entry-schema';
import { ApiError, zodIssues } from './api-response';
import { getServerDb } from './firebase-server';
import { SETTINGS_COLLECTION } from './taxonomy-store';

export const EDITOR_SETTINGS_DOC_ID = 'editor';

export interface EditorSettingsState {
  keymap: KeymapOverrides;
  // 문서가 없으면 0
  version: number;
  updatedAt: string | null;
  // 문서가 있는지
  stored: boolean;
  // 문서가 스키마와 맞지 않으면 'invalid'(keymap은 빈 객체)
  problem: 'invalid' | null;
}

function settingsRef() {
  return getServerDb().collection(SETTINGS_COLLECTION).doc(EDITOR_SETTINGS_DOC_ID);
}

// 저장된 문서 → 상태
function parseSettingsDoc(exists: boolean, data: DocumentData | undefined): EditorSettingsState {
  if (!exists) return { keymap: {}, version: 0, updatedAt: null, stored: false, problem: null };
  const result = editorSettingsDocSchema.safeParse(data);
  if (!result.success) {
    console.error('[settings] settings/editor가 스키마와 맞지 않습니다', zodIssues(result.error));
    // 깨진 문서도 version을 알면 다음 저장이 그 위에 쓴다(화면의 "기본값으로"로 고칠 수 있다)
    const version =
      typeof data?.version === 'number' && Number.isInteger(data.version) ? data.version : 0;
    return { keymap: {}, version, updatedAt: null, stored: true, problem: 'invalid' };
  }
  const doc = result.data;
  return {
    keymap: { ...doc.keymap },
    version: doc.version,
    updatedAt: toDateValue(doc.updatedAt).toISOString(),
    stored: true,
    problem: null,
  };
}

// 지금 설정
export async function readEditorSettings(): Promise<EditorSettingsState> {
  const snapshot = await settingsRef().get();
  return parseSettingsDoc(snapshot.exists, snapshot.data());
}

// 설정을 바꾼다. baseVersion은 화면이 받은 version이다
export async function writeEditorSettings(input: {
  keymap: KeymapOverrides;
  baseVersion: number;
}): Promise<EditorSettingsState> {
  // 요청 값 그대로 검사한다(모르는 id는 기본값 비교 전에 걸러야 한다)
  const issues = validateKeymapOverrides(input.keymap);
  if (issues.length > 0) {
    throw new ApiError(
      422,
      'INVALID_KEYMAP',
      '키 설정에 문제가 있습니다.',
      issues.map((issue) => ({ field: `keymap.${issue.id}`, ...issue })),
    );
  }
  const keymap = compactOverrides(input.keymap);
  const ref = settingsRef();
  return getServerDb().runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const current = parseSettingsDoc(snapshot.exists, snapshot.data());
    if (current.version !== input.baseVersion) {
      throw new ApiError(
        409,
        'SETTINGS_CONFLICT',
        '다른 곳에서 설정을 먼저 바꿨습니다. 화면을 다시 불러오세요.',
        {
          version: current.version,
        },
      );
    }
    const version = current.version + 1;
    const updatedAt = Timestamp.now();
    tx.set(ref, { keymap, version, updatedAt });
    return {
      keymap,
      version,
      updatedAt: updatedAt.toDate().toISOString(),
      stored: true,
      problem: null,
    };
  });
}
