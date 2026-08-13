// Firestore 보안 규칙과 색인을 올린다. Firebase CLI 도, 브라우저 로그인도 필요 없다.
// 서비스 계정 키 하나만 있으면 된다.
//
//   node scripts/setup-firebase.mjs <서비스계정키.json>
//   node scripts/setup-firebase.mjs <서비스계정키.json> --env   (.env.local 도 만든다)
//
// 서비스 계정 키는 Firebase 콘솔에서 받는다.
//   프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성

import { createSign } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const keyPath = process.argv[2];
const writeEnv = process.argv.includes("--env");

if (!keyPath || !existsSync(keyPath)) {
  console.error("서비스 계정 키 파일 경로를 넣어 주세요.");
  console.error("  node scripts/setup-firebase.mjs ./serviceAccount.json");
  process.exit(1);
}

const sa = JSON.parse(readFileSync(keyPath, "utf8"));
const PROJECT = sa.project_id;

function b64url(buf) {
  return Buffer.from(buf).toString("base64url");
}

async function accessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: [
        "https://www.googleapis.com/auth/datastore",
        "https://www.googleapis.com/auth/firebase",
        "https://www.googleapis.com/auth/cloud-platform",
      ].join(" "),
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const sig = b64url(signer.sign(sa.private_key));
  const assertion = `${header}.${claim}.${sig}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const json = await res.json();
  if (!json.access_token) throw new Error("토큰을 못 받았습니다: " + JSON.stringify(json));
  return json.access_token;
}

async function call(token, url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function deployRules(token) {
  const source = readFileSync(resolve(import.meta.dirname, "..", "firestore.rules"), "utf8");
  const created = await call(
    token,
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    "POST",
    { source: { files: [{ name: "firestore.rules", content: source }] } }
  );
  if (!created.ok) {
    console.error("  규칙 등록 실패:", JSON.stringify(created.json).slice(0, 400));
    return false;
  }
  const rulesetName = created.json.name;

  // 이미 릴리스가 있으면 갈아끼우고, 없으면 새로 만든다
  const releaseName = `projects/${PROJECT}/releases/cloud.firestore`;
  const patched = await call(
    token,
    `https://firebaserules.googleapis.com/v1/${releaseName}`,
    "PATCH",
    { release: { name: releaseName, rulesetName } }
  );
  if (patched.ok) return true;

  const madeNew = await call(
    token,
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases`,
    "POST",
    { name: releaseName, rulesetName }
  );
  if (!madeNew.ok) {
    console.error("  규칙 배포 실패:", JSON.stringify(madeNew.json).slice(0, 400));
    return false;
  }
  return true;
}

async function deployIndexes(token) {
  const spec = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "..", "firestore.indexes.json"), "utf8")
  );
  let made = 0;
  let already = 0;
  for (const idx of spec.indexes) {
    const url =
      `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)` +
      `/collectionGroups/${idx.collectionGroup}/indexes`;
    const res = await call(token, url, "POST", {
      queryScope: idx.queryScope,
      fields: idx.fields.map((f) => ({ fieldPath: f.fieldPath, order: f.order })),
    });
    if (res.ok) made++;
    else if (res.status === 409 || /already exists/i.test(JSON.stringify(res.json))) already++;
    else console.error(`  색인 실패(${idx.collectionGroup}):`, JSON.stringify(res.json).slice(0, 300));
  }
  return { made, already };
}

function envLocal() {
  const lines = [
    `FIREBASE_PROJECT_ID=${PROJECT}`,
    `FIREBASE_CLIENT_EMAIL=${sa.client_email}`,
    `FIREBASE_PRIVATE_KEY="${sa.private_key.replace(/\n/g, "\\n")}"`,
    `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${PROJECT}`,
    `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${PROJECT}.firebaseapp.com`,
    `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${PROJECT}.firebasestorage.app`,
    `DEMO_SECRET=${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`,
    "",
    "# 아래 두 줄은 Firebase 콘솔 > 프로젝트 설정 > 내 앱 > 웹 앱에서 받아 채운다",
    "NEXT_PUBLIC_FIREBASE_API_KEY=",
    "NEXT_PUBLIC_FIREBASE_APP_ID=",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=",
    "",
  ];
  writeFileSync(resolve(import.meta.dirname, "..", ".env.local"), lines.join("\n"), "utf8");
}

const main = async () => {
  console.log(`\n프로젝트: ${PROJECT}\n`);
  const token = await accessToken();
  console.log("  인증 통과");

  const rules = await deployRules(token);
  console.log(rules ? "  보안 규칙 올림" : "  보안 규칙 실패");

  const idx = await deployIndexes(token);
  console.log(`  색인 새로 만듦 ${idx.made}개, 이미 있음 ${idx.already}개`);

  if (writeEnv) {
    envLocal();
    console.log("  .env.local 만듦 — API_KEY 와 APP_ID 는 손으로 채워야 합니다");
  }

  console.log(`
남은 일
  1. Firebase 콘솔 > Authentication > 로그인 방법에서 '익명'과 'Google'을 켠다
  2. 웹 앱을 등록하고 apiKey, appId, messagingSenderId 를 .env.local 에 채운다
  3. npm run dev 로 확인한 뒤 vercel 에 같은 값을 넣는다
`);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
