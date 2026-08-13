import { hasFirebase } from "../firebase-admin";
import { firestoreStore } from "./firestore";
import { memoryStore } from "./memory";
import type { Store } from "./types";

/** Firebase 자격증명이 있으면 Firestore, 없으면 메모리로 돈다 */
export function store(): Store {
  return hasFirebase() ? firestoreStore : memoryStore;
}

export const LIVE = () => hasFirebase();

/**
 * 거래를 열 수 있는지.
 *
 * 메모리 저장소는 프로세스 안에서만 산다. 서버리스는 요청마다 다른 인스턴스가
 * 뜨므로 방금 만든 계정이 다음 요청에서 사라진다. 그래서 배포된 곳에서
 * 데이터베이스가 없으면 거래를 열지 않고 보기만 하게 둔다.
 * 손에서 돌릴 때(로컬)는 한 프로세스뿐이니 메모리로도 제대로 돈다.
 */
export function canTrade(): boolean {
  if (hasFirebase()) return true;
  return !process.env.VERCEL;
}
export type { Store };
export * from "./types";
