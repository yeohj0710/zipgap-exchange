import { createHmac, timingSafeEqual } from "node:crypto";
import { admin } from "./firebase-admin";
import { verifyFirebaseToken } from "./verify-token";

export interface Session {
  uid: string;
  anon: boolean;
}

/**
 * 로그인 확인.
 *
 * Firebase 를 붙였으면 Firebase Auth 토큰을 검증한다.
 * 아직 안 붙였으면(데모) 브라우저가 만든 게스트 id 를 서명해서 쓴다.
 * 데모 비밀키는 배포마다 달라도 되므로 고정값이면 충분하다.
 */
const DEMO_SECRET = process.env.DEMO_SECRET ?? "zipgap-demo";

export function signDemoToken(uid: string): string {
  const mac = createHmac("sha256", DEMO_SECRET).update(uid).digest("base64url");
  return `${uid}.${mac}`;
}

function verifyDemoToken(token: string): string | null {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const uid = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const expect = createHmac("sha256", DEMO_SECRET).update(uid).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? uid : null;
}

export async function sessionFrom(req: Request): Promise<Session | null> {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  if (!token) return null;

  const a = admin();
  if (a) {
    const decoded = await verifyFirebaseToken(token, a.projectId);
    if (!decoded) return null;
    return { uid: decoded.uid, anon: decoded.provider === "anonymous" };
  }

  const uid = verifyDemoToken(token);
  return uid ? { uid, anon: true } : null;
}

/** 게스트 id 는 서버가 만들어 준다 */
export function newGuestUid(): string {
  return "guest_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const ADJ = [
  "느긋한", "성실한", "조용한", "부지런한", "느린", "빠른", "겸손한", "대담한",
  "신중한", "낙천적인", "까다로운", "너그러운", "예리한", "묵직한", "발빠른",
];
const NOUN = [
  "집주인", "세입자", "중개인", "감정평가사", "임대인", "매수인", "매도인",
  "청약자", "실거주자", "갭투자자", "분양권자", "재건축조합원", "임차인",
];

export function randomNick(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  const n = NOUN[Math.floor(Math.random() * NOUN.length)];
  return `${a} ${n}${Math.floor(Math.random() * 900 + 100)}`;
}

export function cleanNick(raw: string): string {
  const v = raw.replace(/[\s​]+/g, " ").trim().slice(0, 16);
  return v.length >= 2 ? v : "";
}
