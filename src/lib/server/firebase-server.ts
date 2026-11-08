// Firebase Admin SDK 서버 초기화
// - Firestore, Auth, Storage를 같은 앱 인스턴스로 쓴다.
// - 서버(SSR, API)에서만 가져온다. 클라이언트 번들에 들어가면 안 된다.

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let app: App | undefined;
let db: Firestore | undefined;
let auth: Auth | undefined;

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

// 세션 쿠키 발급·검증에 쓰는 Admin Auth (재건 2단계 D5)
export function getServerAuth() {
  if (!auth) {
    auth = getAuth(getServerApp());
  }

  return auth;
}

// 기본 Storage 버킷 이름. 본문의 자산 주소를 찾을 때도 쓴다
export function getStorageBucketName(): string {
  const name = import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!name) {
    throw new Error('PUBLIC_FIREBASE_STORAGE_BUCKET 설정이 없습니다.');
  }
  return name;
}

// 기본 Storage 버킷 (자산 업로드·변형·정리, 재건 2단계 D6)
export function getServerBucket() {
  return getStorage(getServerApp()).bucket(getStorageBucketName());
}
