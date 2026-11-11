// 자산 사용 기록 (assets.usedBy, orphanedAt) (재건 2단계 D6 "정리")
// - 글을 저장·발행하면 본문과 표지에서 Storage 주소를 뽑아 usedBy를 맞춘다.
// - 글을 지우면 그 글 ID를 usedBy에서 뺀다. usedBy가 비면 orphanedAt을 적는다.
// - 다시 쓰이면 orphanedAt을 지운다.
// - 자산 문서가 없는 주소(외부 이미지, 지운 파일)는 건너뛴다.

import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { assetIdFromStoragePath, collectContentStoragePaths } from '@/lib/asset-refs';
import type { EntryContent } from '@/lib/entry-schema';
import { ASSETS_COLLECTION } from './entries';
import { getServerDb, getStorageBucketName } from './firebase-server';

// 글 내용 여러 개(초안, 발행본)가 쓰는 자산 ID
export function collectUsedAssetIds(contents: readonly (EntryContent | null | undefined)[]): Set<string> {
  const bucket = getStorageBucketName();
  const ids = new Set<string>();
  for (const content of contents) {
    if (!content) continue;
    for (const path of collectContentStoragePaths(content, bucket)) {
      ids.add(assetIdFromStoragePath(path));
    }
  }
  return ids;
}

// 글 하나의 자산 사용 기록을 맞춘다
// - nextIds: 이 글이 지금 쓰는 자산 ID (빈 집합이면 모두 놓는다)
// - 돌려주는 값: 새로 고아가 된 자산 수
export async function syncAssetUsage(entryId: string, nextIds: ReadonlySet<string>): Promise<number> {
  const db = getServerDb();
  const assets = db.collection(ASSETS_COLLECTION);

  // 지금 이 글을 쓰고 있다고 적힌 자산
  const previous = await assets.where('usedBy', 'array-contains', entryId).select().get();
  const previousIds = new Set(previous.docs.map((docSnap) => docSnap.id));

  const toAdd = [...nextIds].filter((id) => !previousIds.has(id));
  const toRemove = [...previousIds].filter((id) => !nextIds.has(id));
  if (toAdd.length === 0 && toRemove.length === 0) return 0;

  const refs: DocumentReference[] = [...toAdd, ...toRemove].map((id) => assets.doc(id));

  return db.runTransaction(async (tx) => {
    const snapshots = await tx.getAll(...refs);
    const now = new Date();
    let orphaned = 0;
    for (const snapshot of snapshots) {
      if (!snapshot.exists) continue;
      const usedBy: string[] = Array.isArray(snapshot.get('usedBy')) ? snapshot.get('usedBy') : [];
      if (toAdd.includes(snapshot.id)) {
        tx.update(snapshot.ref, { usedBy: FieldValue.arrayUnion(entryId), orphanedAt: null });
        continue;
      }
      const remaining = usedBy.filter((id) => id !== entryId);
      if (remaining.length === 0) {
        tx.update(snapshot.ref, { usedBy: [], orphanedAt: now });
        orphaned += 1;
      } else {
        tx.update(snapshot.ref, { usedBy: remaining });
      }
    }
    return orphaned;
  });
}
