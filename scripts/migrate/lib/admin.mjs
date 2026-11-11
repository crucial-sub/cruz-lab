// 마이그레이션 스크립트 공통: Firebase Admin 초기화, 쓰기 대상 고정, 덤프·복원 직렬화
// - 실행: node --env-file=.env scripts/migrate/<스크립트>.mjs
// - 이 파일은 옛 컬렉션(posts, series)에 쓰는 함수를 갖지 않는다.

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

// 스크립트가 쓸 수 있는 컬렉션 (Plan 5.1: 쓰기 대상 상수 고정)
export const ENTRIES = 'entries';
export const SERIES_META = 'seriesMeta';
export const ASSETS = 'assets';
// 마이그레이션 스크립트는 위 3개만 쓴다. 되돌리기·복원 스크립트는 아래 2개도 지운다·되살린다
export const PUBLISH_LOG = 'publishLog';
export const ENTRY_TOMBSTONES = 'entryTombstones';
export const NEW_COLLECTIONS = [ENTRIES, SERIES_META, ASSETS, PUBLISH_LOG, ENTRY_TOMBSTONES];

// 읽기만 하는 옛 컬렉션
export const LEGACY_POSTS = 'posts';
export const LEGACY_SERIES = 'series';

// 덤프 위치: 저장소 밖 (Plan D7 B1)
export const BACKUP_ROOT = path.join(os.homedir(), 'projects', 'cruz-lab-backups');

// .env 값으로 Admin SDK를 초기화한다
export function initAdmin() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const bucketName = process.env.PUBLIC_FIREBASE_STORAGE_BUCKET;

  if (!projectId || !clientEmail || !privateKey || !bucketName) {
    throw new Error('.env에 Firebase Admin 값과 PUBLIC_FIREBASE_STORAGE_BUCKET이 필요합니다. node --env-file=.env로 실행하세요.');
  }

  const app =
    getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), storageBucket: bucketName });
  return { db: getFirestore(app), bucket: getStorage(app).bucket(bucketName), bucketName, projectId };
}

// 쓰기 대상 확인. 새 컬렉션이 아니면 바로 멈춘다
export function assertWritableCollection(name, allowed = NEW_COLLECTIONS) {
  if (!allowed.includes(name)) {
    throw new Error(`쓰기 금지 컬렉션입니다: ${name}`);
  }
}

// 값 직렬화: Timestamp를 태그 붙은 객체로 바꾼다 (손실 없음)
export function serializeValue(value) {
  if (value instanceof Timestamp) {
    return { __fs: 'timestamp', seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  if (value instanceof Date) {
    return serializeValue(Timestamp.fromDate(value));
  }
  if (Array.isArray(value)) return value.map(serializeValue);
  if (value && typeof value === 'object') {
    if (typeof value.toDate === 'function' && typeof value.toMillis === 'function') {
      return serializeValue(Timestamp.fromMillis(value.toMillis()));
    }
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = serializeValue(value[key]);
    return result;
  }
  return value;
}

// 직렬화한 값을 Firestore 값으로 되돌린다
export function deserializeValue(value) {
  if (Array.isArray(value)) return value.map(deserializeValue);
  if (value && typeof value === 'object') {
    if (value.__fs === 'timestamp') return new Timestamp(value.seconds, value.nanoseconds);
    const result = {};
    for (const [key, inner] of Object.entries(value)) result[key] = deserializeValue(inner);
    return result;
  }
  return value;
}

// 문서 내용의 SHA-256 (키 순서를 고정한 JSON 기준)
export function hashDocData(data) {
  return createHash('sha256').update(JSON.stringify(serializeValue(data))).digest('hex');
}

// Firestore 값 → Date (Timestamp, Date, 그 밖은 undefined)
export function toDate(value) {
  if (value instanceof Date) return value;
  if (value && typeof value.toDate === 'function') return value.toDate();
  return undefined;
}

// 컬렉션 하나를 하위 컬렉션까지 읽어 직렬화한다
async function dumpCollection(collectionRef) {
  const snapshot = await collectionRef.get();
  const result = {};
  for (const docSnap of snapshot.docs) {
    const subcollections = {};
    for (const sub of await docSnap.ref.listCollections()) {
      subcollections[sub.id] = await dumpCollection(sub);
    }
    result[docSnap.id] = { data: serializeValue(docSnap.data()), subcollections };
  }
  return result;
}

// 사람이 읽기 쉬운 시각 문자열 (폴더 이름용, 한국 시간)
export function stampForPath(date = new Date()) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString();
  return kst.slice(0, 19).replace(/[-:]/g, '').replace('T', '-');
}

// B1 덤프: 지정한 컬렉션을 JSON으로 저장한다. 실패하면 예외가 나서 스크립트가 멈춘다
export async function writeDump(db, collections, label) {
  const dir = path.join(BACKUP_ROOT, `${stampForPath()}-${label}`);
  await fs.mkdir(dir, { recursive: true });
  const counts = {};
  for (const name of collections) {
    const dumped = await dumpCollection(db.collection(name));
    counts[name] = Object.keys(dumped).length;
    await fs.writeFile(path.join(dir, `${name}.json`), `${JSON.stringify(dumped, null, 2)}\n`, 'utf8');
  }
  await fs.writeFile(
    path.join(dir, 'manifest.json'),
    `${JSON.stringify({ createdAt: new Date().toISOString(), label, counts }, null, 2)}\n`,
    'utf8',
  );
  return { dir, counts };
}

// 덤프 파일 하나를 읽는다
export async function readDumpCollection(dir, name) {
  const raw = await fs.readFile(path.join(dir, `${name}.json`), 'utf8');
  return JSON.parse(raw);
}

// 쓰기 묶음: 400개마다 커밋한다 (Firestore 한도 500)
export class ChunkedBatch {
  constructor(db, allowed = NEW_COLLECTIONS) {
    this.db = db;
    this.allowed = allowed;
    this.batch = db.batch();
    this.size = 0;
    this.total = 0;
  }

  // ref의 최상위 컬렉션 이름을 확인한다
  check(ref) {
    const top = ref.path.split('/')[0];
    assertWritableCollection(top, this.allowed);
  }

  // precondition: update에만 쓴다. { lastUpdateTime }을 주면 그 뒤에 문서가 바뀌었을 때 커밋이 실패한다
  async op(kind, ref, data, precondition) {
    this.check(ref);
    if (kind === 'create') this.batch.create(ref, data);
    else if (kind === 'set') this.batch.set(ref, data);
    // 칸 일부만 바꾼다(4단계 프로젝트 이전: 자산 usedBy, seriesMeta.project 칸 삭제, 재동기화 갱신)
    else if (kind === 'update') {
      if (precondition) this.batch.update(ref, data, precondition);
      else this.batch.update(ref, data);
    }
    else if (kind === 'delete') this.batch.delete(ref);
    else throw new Error(`모르는 쓰기 종류: ${kind}`);
    this.size += 1;
    this.total += 1;
    if (this.size >= 400) await this.flush();
  }

  async flush() {
    if (this.size === 0) return;
    await this.batch.commit();
    this.batch = this.db.batch();
    this.size = 0;
  }
}

// 명령줄 인자 읽기: --flag, --key value
export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}
