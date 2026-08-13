import { createPublicKey, createVerify } from "node:crypto";

/**
 * Firebase 로그인 토큰을 직접 검증한다.
 *
 * firebase-admin/auth 를 쓰면 jwks-rsa 가 딸려 오고, 그게 jose(ESM)를
 * require 로 불러서 Vercel 서버리스에서 모듈 적재가 통째로 실패한다.
 * 토큰 검증은 구글 공개 인증서로 서명만 확인하면 되는 일이라 직접 한다.
 * 새 의존성이 하나도 필요 없다.
 */

const CERT_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

let cache: { certs: Record<string, string>; until: number } | null = null;

async function googleCerts(): Promise<Record<string, string>> {
  const now = Date.now();
  if (cache && cache.until > now) return cache.certs;
  const res = await fetch(CERT_URL);
  if (!res.ok) throw new Error("구글 인증서를 못 받았습니다.");
  const certs = (await res.json()) as Record<string, string>;
  // 응답의 max-age 만큼 들고 있는다. 없으면 한 시간
  const cc = res.headers.get("cache-control") ?? "";
  const m = /max-age=(\d+)/.exec(cc);
  const ttl = m ? Number(m[1]) * 1000 : 3_600_000;
  cache = { certs, until: now + Math.min(ttl, 6 * 3_600_000) };
  return certs;
}

function decodeSegment(seg: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(seg, "base64url").toString("utf8"));
}

export interface VerifiedToken {
  uid: string;
  provider: string;
}

export async function verifyFirebaseToken(
  token: string,
  projectId: string
): Promise<VerifiedToken | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = decodeSegment(h);
    payload = decodeSegment(p);
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

  const now = Math.floor(Date.now() / 1000);
  const skew = 60;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof payload.exp !== "number" || payload.exp < now - skew) return null;
  if (typeof payload.iat !== "number" || payload.iat > now + skew) return null;
  const sub = payload.sub;
  if (typeof sub !== "string" || !sub) return null;

  let certs: Record<string, string>;
  try {
    certs = await googleCerts();
  } catch {
    return null;
  }
  const cert = certs[header.kid];
  if (!cert) return null;

  try {
    const pub = createPublicKey(cert);
    const v = createVerify("RSA-SHA256");
    v.update(`${h}.${p}`);
    v.end();
    if (!v.verify(pub, Buffer.from(s, "base64url"))) return null;
  } catch {
    return null;
  }

  const firebase = payload.firebase as { sign_in_provider?: string } | undefined;
  return { uid: sub, provider: firebase?.sign_in_provider ?? "unknown" };
}
