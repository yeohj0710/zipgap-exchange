// data/listings.json 이 규격에 맞는지 본다. 규격은 data/SCHEMA.md 에 있다.
//   npm run verify:data
//
// 통과하지 못하면 커밋하지 않는다.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const FILE = resolve(ROOT, "data", "listings.json");
const LOCK = resolve(ROOT, "data", "symbols.lock.json");

const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

const SIDOS = new Set(["서울", "경기", "인천", "부산", "전국", "광역시"]);

const data = JSON.parse(readFileSync(FILE, "utf8"));

// ── 전체 ────────────────────────────────────────────────────────────
if (!/^\d{4}-\d{2}-\d{2}$/.test(data.version ?? ""))
  err(`version 이 YYYY-MM-DD 가 아닙니다: ${data.version}`);
if (!["seed-estimate", "partial-real", "real"].includes(data.status))
  err(`status 값이 이상합니다: ${data.status}`);
if (!Array.isArray(data.assets) || data.assets.length === 0) err("assets 가 비었습니다");

const seen = new Set();
let realCount = 0;
let totalPoints = 0;
let realPoints = 0;

const monthDiff = (a, b) => {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
};

for (const a of data.assets ?? []) {
  const tag = a.symbol ?? "(이름 없음)";

  if (!/^[A-Z0-9]{2,16}$/.test(a.symbol ?? "")) err(`${tag}: symbol 은 대문자 영문·숫자만`);
  if (seen.has(a.symbol)) err(`${tag}: symbol 이 겹칩니다`);
  seen.add(a.symbol);

  if (!a.name) err(`${tag}: name 이 없습니다`);
  if (!["complex", "index"].includes(a.kind)) err(`${tag}: kind 는 complex 또는 index`);
  if (!SIDOS.has(a.sido)) err(`${tag}: sido 가 목록에 없습니다 (${a.sido})`);
  if (!a.region) err(`${tag}: region 이 없습니다`);
  if (!Array.isArray(a.tags)) err(`${tag}: tags 는 배열이어야 합니다`);

  if (a.shareDivisor !== 100000) err(`${tag}: shareDivisor 는 100000 이어야 합니다`);
  if (!(a.rentYield > 0 && a.rentYield < 0.2))
    err(`${tag}: rentYield 가 이상합니다 (${a.rentYield})`);

  if (a.kind === "complex") {
    if (!(a.unitArea > 10 && a.unitArea < 400))
      err(`${tag}: unitArea 가 이상합니다 (${a.unitArea})`);
    if (a.lawdCd && !/^\d{5}$/.test(a.lawdCd)) err(`${tag}: lawdCd 는 5자리 숫자`);
    if (!a.lawdCd) warn(`${tag}: lawdCd 가 없습니다. 실거래 조회를 못 합니다`);
    if (!a.aptName) warn(`${tag}: aptName 이 없습니다. 실거래 조회를 못 합니다`);
  }

  // ── history ──
  const h = a.history;
  if (!Array.isArray(h) || h.length < 2) {
    err(`${tag}: history 가 2개 미만입니다`);
    continue;
  }

  let assetHasReal = false;
  for (let i = 0; i < h.length; i++) {
    const p = h[i];
    const at = `${tag} ${p.ym}`;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p.ym ?? "")) err(`${at}: ym 이 YYYY-MM 이 아닙니다`);
    if (!Number.isInteger(p.price) || p.price <= 0)
      err(`${at}: price 는 0보다 큰 정수(만원)여야 합니다`);
    if (p.price > 0 && p.price < 100)
      err(`${at}: price 단위가 만원이 맞습니까 (${p.price})`);
    if (p.source && !["real", "seed"].includes(p.source))
      err(`${at}: source 는 real 또는 seed`);
    if (p.trades !== undefined && (!Number.isInteger(p.trades) || p.trades < 0))
      err(`${at}: trades 는 0 이상 정수`);

    if (i > 0) {
      const d = monthDiff(h[i - 1].ym, p.ym);
      if (d !== 1) err(`${at}: 앞 달(${h[i - 1].ym})과 ${d}개월 차이. 달이 비었거나 순서가 틀렸습니다`);
      const prev = h[i - 1].price;
      if (prev > 0) {
        const jump = Math.abs(p.price - prev) / prev;
        if (jump > 0.4)
          err(`${at}: 한 달 만에 ${(jump * 100).toFixed(0)}% 움직였습니다 (${prev} → ${p.price})`);
        else if (jump > 0.2)
          warn(`${at}: 한 달 만에 ${(jump * 100).toFixed(0)}% 움직였습니다. 원자료를 확인하세요`);
      }
    }

    totalPoints++;
    if (p.source === "real") {
      realPoints++;
      assetHasReal = true;
    }
  }
  if (assetHasReal) realCount++;
}

// ── symbol 잠금 대조 ────────────────────────────────────────────────
if (existsSync(LOCK)) {
  const lock = JSON.parse(readFileSync(LOCK, "utf8"));
  for (const s of lock.symbols ?? []) {
    if (!seen.has(s)) err(`symbol '${s}' 가 사라졌습니다. 사람들이 이미 갖고 있는 종목입니다`);
  }
} else {
  warn("data/symbols.lock.json 이 없습니다. 지금 목록으로 만들어 두세요");
}

// ── status 와 실제가 맞는지 ────────────────────────────────────────
const ratio = totalPoints > 0 ? realPoints / totalPoints : 0;
if (data.status === "real" && ratio < 0.9)
  err(`status 가 real 인데 실거래 비율이 ${(ratio * 100).toFixed(1)}% 뿐입니다`);
if (data.status === "seed-estimate" && realPoints > 0)
  warn(`실거래가 ${realPoints}건 들어왔습니다. status 를 partial-real 로 올리세요`);

// ── 결과 ────────────────────────────────────────────────────────────
console.log(`\n종목 ${seen.size}개 · 시세 ${totalPoints}개`);
console.log(
  `실거래 원자료 ${realPoints}개 (${(ratio * 100).toFixed(1)}%) · 실거래가 하나라도 들어간 종목 ${realCount}개`
);

if (warns.length) {
  console.log(`\n살펴볼 것 ${warns.length}건`);
  for (const w of warns.slice(0, 30)) console.log(`  - ${w}`);
  if (warns.length > 30) console.log(`  ... 그 밖에 ${warns.length - 30}건`);
}

if (errors.length) {
  console.log(`\n고쳐야 할 것 ${errors.length}건`);
  for (const e of errors.slice(0, 50)) console.log(`  x ${e}`);
  if (errors.length > 50) console.log(`  ... 그 밖에 ${errors.length - 50}건`);
  console.log("");
  process.exit(1);
}

console.log(`\n규격에 맞습니다.\n`);
