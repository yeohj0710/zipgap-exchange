import { hasFirebase } from "../firebase-admin";
import { firestoreStore } from "./firestore";
import { memoryStore } from "./memory";
import type { Store } from "./types";

/** Firebase 자격증명이 있으면 Firestore, 없으면 메모리로 돈다 */
export function store(): Store {
  return hasFirebase() ? firestoreStore : memoryStore;
}

export const LIVE = () => hasFirebase();
export type { Store };
export * from "./types";
