// 다음에 할 일 하나를 골라 준다. 무엇을 할지 스스로 정하지 말고 이걸 물어본다.
//   npm run data:next
//   npm run data:next -- --count 5     (여러 개 한꺼번에)
//   npm run data:next -- --stats       (진행률만)
//
// 이 스크립트는 인터넷에 나가지 않고 유료 호출도 하지 않는다.
// 할 일 목록만 만든다. 자료를 받아 오는 일은 에이전트가 직접 한다.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const data = JSON.parse(readFileSync(resolve(ROOT, "data", "listings.json"), "utf8"));
const wishPath = resolve(ROOT, "data", "wishlist.json");
const wish = existsSync(wishPath) ? JSON.parse(readFileSync(wishPath, "utf8")) : { candidates: [] };

const args = process.argv.slice(2);
const count = Number(args[args.indexOf("--count") + 1]) || 1;
const statsOnly = args.includes("--stats");

const complexes = data.assets.filter((a) => a.kind === "complex");
const indexes = data.assets.filter((a) => a.kind === "index");

// ── 진행률 ──────────────────────────────────────────────────────────
let total = 0;
let real = 0;
for (const a of data.assets) {
  for (const p of a.history) {
    total++;
    if (p.source === "real") real++;
  }
}
const noKey = complexes.filter((a) => !a.lawdCd || !a.aptName);

console.log(`종목 ${data.assets.length}개 (단지 ${complexes.length}, 지수 ${indexes.length})`);
console.log(`시세 ${total}칸 중 실거래 ${real}칸 — ${((real / total) * 100).toFixed(1)}%`);
console.log(`조회 열쇠(lawdCd·aptName) 없는 단지 ${noKey.length}개`);
console.log(`추가 후보 대기 ${wish.candidates?.length ?? 0}개`);

if (statsOnly) process.exit(0);

// ── 할 일 고르기 ────────────────────────────────────────────────────
const tasks = [];

// 1순위: 조회 열쇠 확정. 이게 없으면 아무것도 못 받아 온다
for (const a of noKey) {
  tasks.push({
    kind: "resolve-key",
    symbol: a.symbol,
    say:
      `${a.symbol}(${a.name}, ${a.region})의 lawdCd(법정동코드 시군구 5자리)와 ` +
      `aptName(국토부 실거래 자료에 적힌 아파트명 원문)을 확정해서 data/listings.json 에 넣는다. ` +
      `아파트명은 실제 조회로 확인한다. 짐작해서 넣지 않는다.`,
  });
}

// 2순위: 최근 달부터 실거래로 채우기
const pending = [];
for (const a of data.assets) {
  if (a.kind === "complex" && (!a.lawdCd || !a.aptName)) continue;
  for (const p of a.history) {
    if (p.source !== "real") pending.push({ a, ym: p.ym });
  }
}
pending.sort((x, y) => y.ym.localeCompare(x.ym));
for (const { a, ym } of pending) {
  tasks.push({
    kind: "fill-month",
    symbol: a.symbol,
    ym,
    say:
      a.kind === "complex"
        ? `${a.symbol}(${a.name}) ${ym} 실거래를 받아 온다. lawdCd=${a.lawdCd ?? "?"}, ` +
          `aptName=${a.aptName ?? "?"}, 전용면적 ${a.unitArea}m² ±1.5 안의 거래만 골라 중앙값을 ` +
          `만원 단위 정수로 price 에 넣고 trades 에 건수, source 를 real 로 바꾼다. ` +
          `거래가 0건이면 손대지 말고 seed 로 둔다.`
        : `${a.symbol}(${a.name}) ${ym} 지수를 낸다. ${a.region} 안의 아파트 매매 실거래를 ` +
          `모두 모아 중앙값을 만원 단위로 price 에 넣고 source 를 real 로 바꾼다.`,
  });
}

// 3순위: 종목 늘리기
for (const c of wish.candidates ?? []) {
  tasks.push({
    kind: "add-asset",
    say:
      `새 종목 후보 ${c.name ?? c}를 data/listings.json 에 넣는다. ` +
      `data/SCHEMA.md 를 그대로 따르고, 넣은 뒤 후보 목록에서 지운다.`,
  });
}

// 4순위: 더 넣을 단지 찾기
if (tasks.length === 0) {
  tasks.push({
    kind: "scout",
    say:
      `채울 게 없다. 아직 안 올린 단지를 20개 찾아 data/wishlist.json 의 candidates 에 넣는다. ` +
      `이미 있는 지역에 쏠리지 않게 시도를 섞고, 거래가 꾸준한 단지를 고른다.`,
  });
}

console.log(`\n남은 일 ${tasks.length}건 — 위에서부터 ${Math.min(count, tasks.length)}건\n`);
tasks.slice(0, count).forEach((t, i) => {
  console.log(`${i + 1}. [${t.kind}] ${t.say}\n`);
});
