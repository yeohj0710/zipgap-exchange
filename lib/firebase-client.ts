"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
  type Auth,
  type User,
} from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** 브라우저 쪽 Firebase 설정이 다 있는지 */
export const FIREBASE_READY = Boolean(config.apiKey && config.projectId && config.appId);

let app: FirebaseApp | null = null;

export function fbApp(): FirebaseApp | null {
  if (!FIREBASE_READY) return null;
  if (!app) app = getApps().length ? getApp() : initializeApp(config);
  return app;
}

export function fbAuth(): Auth | null {
  const a = fbApp();
  return a ? getAuth(a) : null;
}

export function fbDb(): Firestore | null {
  const a = fbApp();
  return a ? getFirestore(a) : null;
}

export {
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  GoogleAuthProvider,
};
export type { User };
