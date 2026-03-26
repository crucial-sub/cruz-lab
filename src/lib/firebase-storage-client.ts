import { getStorage, type FirebaseStorage } from 'firebase/storage';
import { getClientFirebaseApp } from './firebase-app-client';

let storage: FirebaseStorage | undefined;

export function getClientStorage() {
  if (!storage) {
    storage = getStorage(getClientFirebaseApp());
  }

  return storage;
}
