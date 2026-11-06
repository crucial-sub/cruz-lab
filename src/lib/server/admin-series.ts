import { Timestamp } from 'firebase-admin/firestore';
import type { Series } from '@/lib/series';
import { getServerDb } from './firebase-server';
import { invalidateMemo } from './memo-cache';

// 공개 시리즈 메모리 캐시 키 접두사 (src/lib/series.ts의 SERIES_MEMO_PREFIX와 같은 값)
const SERIES_MEMO_PREFIX = 'series:';

type SeriesPayload = {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  coverImage?: string;
  isPublic?: boolean;
  order?: number;
  postIds?: string[];
};

function buildSeries(id: string, data: Record<string, unknown>): Series {
  const postIds = Array.isArray(data.postIds) ? data.postIds.filter(Boolean) as string[] : [];

  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    slug: typeof data.slug === 'string' ? data.slug : id,
    description: typeof data.description === 'string' ? data.description : '',
    coverImage: typeof data.coverImage === 'string' ? data.coverImage : undefined,
    postIds,
    postCount: typeof data.postCount === 'number' ? data.postCount : postIds.length,
    createdAt: data.createdAt && typeof (data.createdAt as { toDate?: () => Date }).toDate === 'function'
      ? (data.createdAt as { toDate: () => Date }).toDate()
      : new Date(),
    updatedAt: data.updatedAt && typeof (data.updatedAt as { toDate?: () => Date }).toDate === 'function'
      ? (data.updatedAt as { toDate: () => Date }).toDate()
      : new Date(),
    isPublic: data.isPublic === true,
    order: typeof data.order === 'number' ? data.order : 999,
  };
}

export async function listAdminSeries() {
  const db = getServerDb();
  const snapshot = await db.collection('series').orderBy('order', 'asc').get();
  return snapshot.docs.map((docSnap) => buildSeries(docSnap.id, docSnap.data()));
}

export async function getAdminSeriesById(id: string) {
  const db = getServerDb();
  const seriesSnap = await db.collection('series').doc(id).get();
  // Admin SDK의 DocumentSnapshot.exists는 메서드가 아니라 속성이다
  if (!seriesSnap.exists) return null;
  return buildSeries(seriesSnap.id, seriesSnap.data());
}

export async function saveAdminSeries(payload: SeriesPayload) {
  const db = getServerDb();
  const baseData = {
    name: payload.name,
    slug: payload.slug,
    description: payload.description || '',
    coverImage: payload.coverImage || '',
    isPublic: payload.isPublic === true,
    order: Number(payload.order ?? 999),
    postIds: Array.isArray(payload.postIds) ? payload.postIds : [],
    postCount: Array.isArray(payload.postIds) ? payload.postIds.length : 0,
    updatedAt: Timestamp.now(),
  };

  if (payload.id) {
    await db.collection('series').doc(payload.id).update(baseData);
    invalidateMemo(SERIES_MEMO_PREFIX);
    return payload.id;
  }

  const created = await db.collection('series').add({
    ...baseData,
    createdAt: Timestamp.now(),
  });
  invalidateMemo(SERIES_MEMO_PREFIX);

  return created.id;
}

export async function deleteAdminSeries(id: string) {
  const db = getServerDb();
  await db.collection('series').doc(id).delete();
  invalidateMemo(SERIES_MEMO_PREFIX);
}
