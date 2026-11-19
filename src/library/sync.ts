// 폰 판 되돌리기 판정 (서가 2단계 T5, Plan J39·J40)
// - 순수 함수다. I/O가 없다. 서버(폰 저장, 올리기 마무리, 되돌림 알림)와 맥 입구(lab pull, Raycast)가 같이 쓴다.
// - 문서 기록의 되돌리기 상태 mdSync { macSha256, pendingRev } (J39)
//   - macSha256: 맥 원본에 있다고 아는 md의 해시. 모르면 null
//   - pendingRev: 아직 맥에 되돌리지 않은 폰 판 번호. 없으면 null
// - lab.mjs가 빌드 없이 Node(타입 지우기)로 가져온다. 그래서 '@/…' 별칭과 지울 수 없는 TS 문법을 쓰지 않는다
//   (tests/library/node-load.test.ts).

// 문서 기록의 되돌리기 상태 (J39)
export interface MdSync {
  macSha256: string | null;
  pendingRev: number | null;
}

// 맥 원본의 지금 상태
// - file: 파일이 있다(그 내용의 해시). dir: 같은 경로가 폴더다(폴더째 문서). missing: 없다
export type LocalSource = { kind: 'file'; sha256: string } | { kind: 'dir' } | { kind: 'missing' };

// 되돌리기 판정 (J40)
// ① replace: 원본이 서가가 아는 내용이다. 백업한 뒤 폰 판으로 바꾼다
// ② same: 원본이 이미 폰 판과 같다. 알림만 한다
// ③ conflict: 원본도 바뀌었거나(both-changed) 서가가 원본 해시를 모른다(unknown-base). 원본은 그대로 둔다
// ④ skip: 되돌릴 원본 파일이 없다(missing), 폴더째 문서다(folder), 서가 화면으로 올린 문서다(no-source)
export type PullDecision =
  | { kind: 'replace' }
  | { kind: 'same' }
  | { kind: 'conflict'; reason: 'both-changed' | 'unknown-base' }
  | { kind: 'skip'; reason: 'missing' | 'folder' | 'no-source' };

export function decidePull(input: {
  sourcePath: string | null;
  local: LocalSource;
  macSha256: string | null;
  phoneSha256: string;
}): PullDecision {
  if (input.sourcePath === null) return { kind: 'skip', reason: 'no-source' };
  if (input.local.kind === 'missing') return { kind: 'skip', reason: 'missing' };
  if (input.local.kind === 'dir') return { kind: 'skip', reason: 'folder' };
  if (input.local.sha256 === input.phoneSha256) return { kind: 'same' };
  if (input.macSha256 === null) return { kind: 'conflict', reason: 'unknown-base' };
  if (input.local.sha256 === input.macSha256) return { kind: 'replace' };
  return { kind: 'conflict', reason: 'both-changed' };
}

// ---------- 되돌리기 상태 바꾸기 (J39) ----------

// 올리기 마무리에서 md 판을 새로 쓸 때
// - 맥 올리기: 그 판의 index.md가 맥 원본에 있다. 폰 판은 덮였으므로 없다
// - 서가 화면 올리기: 맥 원본이 없다
export function mdSyncForUpload(origin: 'mac' | 'web', entrySha256: string): MdSync {
  return { macSha256: origin === 'mac' ? entrySha256 : null, pendingRev: null };
}

// 폰 저장으로 새 판을 쓸 때
// - 이미 아는 원본 해시는 그대로 둔다(맥 원본은 바뀌지 않았다).
// - 원본 해시를 모르고(1단계 문서는 칸이 없다) 앞 판이 맥 판이면 그 판의 index.md 해시로 채운다.
//   앞 판 기록은 새 판이 준비되면 지워지므로(J9) 지금 옮겨 둔다(Plan 1.3절 8).
export function mdSyncForPhoneSave(
  current: MdSync | undefined,
  base: { origin: 'mac' | 'web' | 'phone'; entrySha256: string },
  newRev: number,
): MdSync {
  const known = current?.macSha256 ?? null;
  const macSha256 = known ?? (base.origin === 'mac' ? base.entrySha256 : null);
  return { macSha256, pendingRev: newRev };
}

// 맥이 폰 판을 원본에 썼다(되돌림 알림)
export function mdSyncAfterPull(sha256: string): MdSync {
  return { macSha256: sha256, pendingRev: null };
}

// ---------- 서버의 판정 ----------

// 맥·서가 화면에서 md를 다시 올릴 때 막고 물어야 하는가 (J42)
// - 아직 되돌리지 않은 폰 판이 있으면 올리기 시작이 409(PHONE_EDIT_PENDING)다. force면 올린다.
// - html 올리기는 막지 않는다. 폰 판은 md만 있다
export function phoneEditBlocksUpload(mdSync: MdSync | undefined, format: 'md' | 'html', force: boolean): boolean {
  return format === 'md' && !force && (mdSync?.pendingRev ?? null) !== null;
}

// lab pull 목록(토큰 API ?pending=md)에 넣을 문서인가 (J41)
// - 서가 화면으로 올린 문서(원본 경로 없음)는 맥에 되돌릴 곳이 없으므로 넣지 않는다
export function hasPendingPull(doc: { sourcePath: string | null; mdSync?: MdSync }): boolean {
  return doc.sourcePath !== null && (doc.mdSync?.pendingRev ?? null) !== null;
}

// 되돌림 알림 { rev, sha256 }을 받을 수 있는가 (J41)
// - rev-changed: 지금 md 판이 알린 판이 아니다(그사이 다시 고쳤거나 맥에서 올렸다). 409
// - sha-mismatch: 판은 같은데 알린 해시가 그 판의 index.md 해시가 아니다. 400
export function checkPulledReport(
  current: { rev: number; entrySha256: string },
  report: { rev: number; sha256: string },
): 'ok' | 'rev-changed' | 'sha-mismatch' {
  if (current.rev !== report.rev) return 'rev-changed';
  return current.entrySha256 === report.sha256 ? 'ok' : 'sha-mismatch';
}

// ---------- 충돌 때 보이는 것 ----------

// ③ 때 원본 옆에 두는 폰 판 파일: a.md → a.phone.md
export function phoneCopyPath(sourcePath: string): string {
  const match = sourcePath.match(/^(.*?)(\.md)$/i);
  return match ? `${match[1]}.phone${match[2]}` : `${sourcePath}.phone.md`;
}

// 차이 앞부분 (③ 때 터미널·Raycast에 보인다)
// - 같은 앞 줄·뒤 줄을 덜고, 그 사이를 "- 원본 줄"과 "+ 폰 판 줄"로 보인다. 줄 끝 CRLF는 LF로 본다.
// - 보이는 줄이 maxLines를 넘으면 자르고 "… N줄 더"를 붙인다. 같으면 빈 목록이다.
export function diffPreview(before: string, after: string, maxLines = 20): string[] {
  const a = before.replace(/\r\n/g, '\n').split('\n');
  const b = after.replace(/\r\n/g, '\n').split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const body = [...a.slice(start, endA).map((line) => `- ${line}`), ...b.slice(start, endB).map((line) => `+ ${line}`)];
  if (body.length === 0) return [];
  const shown = body.slice(0, maxLines);
  const rest = body.length - shown.length;
  return [`@@ ${start + 1}번째 줄부터`, ...shown, ...(rest > 0 ? [`… ${rest}줄 더`] : [])];
}
