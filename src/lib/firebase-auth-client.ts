import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import { getClientFirebaseApp } from './firebase-app-client';

let auth: Auth | undefined;
let googleProvider: GoogleAuthProvider | undefined;

export function getClientAuth() {
  if (!auth) {
    auth = getAuth(getClientFirebaseApp());
  }

  return auth;
}

export function getClientGoogleProvider() {
  if (!googleProvider) {
    googleProvider = new GoogleAuthProvider();
  }

  return googleProvider;
}

export function initializeClientAuth() {
  return {
    auth: getClientAuth(),
    googleProvider: getClientGoogleProvider(),
  };
}
