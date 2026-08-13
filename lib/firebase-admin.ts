import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * 서버용 Firebase.
 * 환경변수가 없으면 null 을 준다. 그때는 메모리 저장소로 돌아간다.
 *
 * firebase-admin/auth 는 일부러 안 쓴다. 딸려 오는 jwks-rsa 가 ESM 모듈을
 * require 로 불러서 서버리스에서 적재가 실패한다. 로그인 토큰은
 * lib/verify-token.ts 에서 구글 공개 인증서로 직접 확인한다.
 */

let cached: { app: App; db: Firestore; projectId: string } | null | undefined;

export function admin() {
  if (cached !== undefined) return cached;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    cached = null;
    return cached;
  }

  const app =
    getApps().find((a) => a.name === "zipgap") ??
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) }, "zipgap");

  const db = getFirestore(app);
  try {
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    // 이미 설정된 경우
  }

  cached = { app, db, projectId };
  return cached;
}

export function hasFirebase(): boolean {
  return admin() !== null;
}
