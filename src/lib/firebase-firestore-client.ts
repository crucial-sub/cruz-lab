import { getFirestore, type Firestore } from 'firebase/firestore';
import { getClientFirebaseApp } from './firebase-app-client';

let db: Firestore | undefined;

export function getClientDb() {
  if (!db) {
    db = getFirestore(getClientFirebaseApp());
  }

  return db;
}
