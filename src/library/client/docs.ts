// 맥 입구 공용 목록·내리기 모듈 (서가 1단계 T9, Plan J16·J19)
// - Raycast "서가 문서" 명령이 쓴다. 서가 토큰 API(/api/library/token/docs)를 부른다.
// - push.ts와 같은 규칙: 상대 가져오기에 .ts, 지울 수 있는 TS 문법만, '@/…' 별칭 없음(tests/library/node-load.test.ts).
// - 서버 모듈(server/store.ts)의 타입을 가져오지 않는다. 그 파일은 Firebase Admin을 가져오므로
//   확장의 타입 검사가 따라 들어가면 깨진다. 그래서 응답 꼴을 여기에 따로 적는다.

import { callTokenApi, PushError, type TokenApiOptions } from './push.ts';

// 형식 하나의 지금 판 (서버 FormatState와 같은 꼴)
export interface LibraryFormatState {
  rev: number;
  entry: string;
  bytes: number;
  fileCount: number;
}

// 서가 문서 요약 (서버 LibraryDocSummary와 같은 꼴)
export interface LibraryDocItem {
  id: string;
  title: string;
  project: string;
  docDate: string | null; // 'YYYY-MM-DD'
  formats: { md?: LibraryFormatState; html?: LibraryFormatState };
  unread: boolean;
  readAt: string | null;
  uploadedAt: string;
  updatedAt: string;
  url: string; // 서가 문서 주소 (J7). QR 코드와 북마크가 쓴다
}

// 서가 목록: 최근 올린 것부터 (서버 순서 그대로)
export async function listDocs(options: TokenApiOptions): Promise<LibraryDocItem[]> {
  const data = await callTokenApi<{ docs?: unknown }>(options, 'GET', '/api/library/token/docs');
  if (!Array.isArray(data.docs)) throw new PushError('BAD_RESPONSE', '서가 목록 응답을 읽지 못했습니다.');
  return data.docs as LibraryDocItem[];
}

// 서가에서 내리기: 서가 사본(버킷 파일, 문서·판 기록)을 지운다. 맥의 원본은 그대로다
export async function removeDoc(options: TokenApiOptions, docId: string): Promise<void> {
  await callTokenApi<null>(options, 'DELETE', `/api/library/token/docs/${encodeURIComponent(docId)}`);
}
