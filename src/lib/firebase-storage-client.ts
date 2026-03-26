import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getClientFirebaseApp } from './firebase-app-client';

const storageInstances = new Map<string, FirebaseStorage>();

function toStorageUrl(bucket: string) {
  return bucket.startsWith('gs://') ? bucket : `gs://${bucket}`;
}

export function getClientStorage(storageBucketOverride?: string) {
  const app = getClientFirebaseApp();
  const configuredBucket = storageBucketOverride || app.options.storageBucket;
  const cacheKey = configuredBucket || '__default__';
  const existing = storageInstances.get(cacheKey);

  if (existing) {
    return existing;
  }

  const storage = configuredBucket
    ? getStorage(app, toStorageUrl(configuredBucket))
    : getStorage(app);

  storageInstances.set(cacheKey, storage);
  return storage;
}

export function getClientStorageBucketCandidates() {
  const bucket = getClientFirebaseApp().options.storageBucket;
  if (!bucket) {
    return [] as string[];
  }

  const normalizedBucket = bucket.replace(/^gs:\/\//, '');
  const candidates = [normalizedBucket];

  if (normalizedBucket.endsWith('.firebasestorage.app')) {
    candidates.push(normalizedBucket.replace(/\.firebasestorage\.app$/, '.appspot.com'));
  }

  return Array.from(new Set(candidates));
}
