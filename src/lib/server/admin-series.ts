import { Timestamp } from 'firebase-admin/firestore';
import type { Series } from '@/lib/series';
import { getServerDb } from './firebase-server';

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
  if (!seriesSnap.exists()) return null;
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
    return payload.id;
  }

  const created = await db.collection('series').add({
    ...baseData,
    createdAt: Timestamp.now(),
  });

  return created.id;
}

export async function deleteAdminSeries(id: string) {
  const db = getServerDb();
  await db.collection('series').doc(id).delete();
}
