import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let app: App | undefined;
let db: Firestore | undefined;

function getServerApp() {
  if (!app) {
    const projectId = import.meta.env.FIREBASE_ADMIN_PROJECT_ID || import.meta.env.PUBLIC_FIREBASE_PROJECT_ID;
    const clientEmail = import.meta.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = import.meta.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error(
        'Firebase Admin SDK 설정이 없습니다. FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY를 확인해주세요.'
      );
    }

    app =
      getApps()[0] ??
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
      });
  }

  return app;
}

export function getServerDb() {
  if (!db) {
    db = getFirestore(getServerApp());
  }

  return db;
}
