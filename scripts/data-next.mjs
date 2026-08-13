// 다음에 할 일을 골라 준다. 무엇을 할지 스스로 정하지 말고 이걸 물어본다.
//   npm run data:next
//   npm run data:next -- --count 5     (여러 개 한꺼번에)
//   npm run data:next -- --stats       (진행률만)
//
// 인증키가 없어도 멈추지 않는다. 키 없이 할 수 있는 일을 대신 내준다.
// 이 스크립트는 인터넷에 나가지 않고 유료 호출도 하지 않는다. 목록만 만든다.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const read = (p, fb) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : fb);

const data = read(resolve(ROOT, "data", "listings.json"));
const wish = read(resolve(ROOT, "data", "wishlist.json"), { candidates: [] });
const hasCodes = existsSync(resolve(ROOT, "data", "lawd-codes.json"));

// 인증키는 .env.data 나 환경변수 어느 쪽에 있어도 된다
function hasKey() {
  if (process.env.MOLIT_SERVICE_KEY) return true;
  const f = resolve(ROOT, ".env.data");
  if (!existsSync(f)) return false;
  return /^\s*MOLIT_SERVICE_KEY\s*=\s*\S+/m.test(readFileSync(f, "utf8"));
}
const key = hasKey();

const args = process.argv.slice(2);
const count = Number(args[args.indexOf("--count") + 1]) || 1;
const statsOnly = args.includes("--stats");

const complexes = data.assets.filter((a) => a.kind === "complex");
const indexes = data.assets.filter((a) => a.kind === "index");

let total = 0;
let real = 0;
for (const a of data.assets) {
  for (const p of a.history) {
    total++;
    if (p.source === "real") real++;
  }
}
const noKeyCd = complexes.filter((a) => !a.lawdCd);
const noApt = complexes.filter((a) => a.lawdCd && !a.aptName);
const noMembers = indexes.filter((a) => !a.members?.length);
const noMeta = complexes.filter((a) => !a.households || !a.builtYear);

console.log(`종목 ${data.assets.length}개 (단지 ${complexes.length}, 지수 ${indexes.length})`);
console.log(`시세 ${total}칸 중 실거래 ${real}칸 — ${((real / total) * 100).toFixed(1)}%`);
console.log(`법정동코드표 ${hasCodes ? "있음" : "없음"} · 실거래 인증키 ${key ? "있음" : "없음"}`);
console.log(
  `lawdCd 없는 단지 ${noKeyCd.length} · aptName 없는 단지 ${noApt.length} · 구성 없는 지수 ${noMembers.length} · 후보 대기 ${wish.candidates?.length ?? 0}`
);

if (!key) {
  console.log(`
인증키가 없어 실거래를 받아오는 일은 건너뛴다. 대신 키 없이 할 수 있는 일을 내준다.
키를 넣으려면 data.go.kr 에서 "국토교통부 아파트 매매 실거래가 상세 자료"를 신청해
받은 키를 프로젝트 폴더의 .env.data 에 이렇게 적는다.

  MOLIT_SERVICE_KEY=받은키

넣고 나면 다음 사이클부터 받아오는 일이 자동으로 목록에 뜬다.`);
}

if (statsOnly) process.exit(0);

const tasks = [];
const add = (kind, say, extra = {}) => tasks.push({ kind, say, ...extra });

// ── 키가 없어도 되는 일 ─────────────────────────────────────────────

if (!hasCodes) {
  add(
    "build-codes",
    `data/lawd-codes.json 이 없다. code.go.kr 에서 법정동코드 전체자료를 받아 ` +
      `node scripts/build-lawd-codes.mjs <받은파일> 로 만든다.`
  );
}

for (const a of noKeyCd) {
  add(
    "resolve-lawd",
    `${a.symbol}(${a.name}, ${a.region})의 lawdCd 가 없다. ` +
      `node scripts/resolve-lawd.mjs 로 맞춰 보고, 보류로 나오면 region 문자열을 ` +
      `법정동 표기에 맞게 고친 뒤 --write 로 넣는다.`
  );
}

for (const a of noMembers) {
  add(
    "resolve-index",
    `지수 ${a.symbol}(${a.name})의 members(구성 시군구 코드)가 비어 있다. ` +
      `scripts/resolve-lawd.mjs 의 INDEX_RULES 에 규칙을 적고 --write 로 채운다.`
  );
}

for (const a of noMeta) {
  add(
    "fill-meta",
    `${a.symbol}(${a.name})의 세대수·준공년도가 비어 있다. 공공데이터포털의 ` +
      `공동주택 단지 목록이나 단지 공식 정보로 채운다. 짐작해서 넣지 않는다.`
  );
}

// 후보를 넉넉히 쌓아 두면 키가 들어온 뒤 바로 확장할 수 있다
const WISH_TARGET = 60;
const wishLeft = WISH_TARGET - (wish.candidates?.length ?? 0);
if (wishLeft > 0) {
  add(
    "scout",
    `올릴 단지 후보가 ${wish.candidates?.length ?? 0}개뿐이다. ` +
      `${Math.min(20, wishLeft)}개를 더 찾아 data/wishlist.json 의 candidates 에 넣는다. ` +
      `한 줄은 { "name": "단지명", "region": "시도 시군구 읍면동", "unitArea": 84.9 } 모양으로 적는다. ` +
      `이미 올라간 지역에 쏠리지 않게 시도를 섞고, 거래가 꾸준한 단지를 고른다. ` +
      `넣은 뒤 node scripts/resolve-lawd.mjs 로 region 이 법정동 표기와 맞는지 확인한다.`
  );
}

// ── 키가 있어야 하는 일 ─────────────────────────────────────────────

if (key) {
  for (const a of noApt) {
    add(
      "resolve-apt",
      `${a.symbol}(${a.name})의 aptName 을 확정한다. lawdCd=${a.lawdCd} 로 최근 달을 조회해 ` +
        `돌아온 아파트명 중 이 단지에 해당하는 원문을 그대로 넣는다. 짐작해서 넣지 않는다.`
    );
  }

  const pending = [];
  for (const a of data.assets) {
    if (a.kind === "complex" && (!a.lawdCd || !a.aptName)) continue;
    if (a.kind === "index" && !a.members?.length) continue;
    for (const p of a.history) if (p.source !== "real") pending.push({ a, ym: p.ym });
  }
  pending.sort((x, y) => y.ym.localeCompare(x.ym));
  for (const { a, ym } of pending) {
    add(
      "fill-month",
      a.kind === "complex"
        ? `${a.symbol}(${a.name}) ${ym} 실거래를 받아 온다. lawdCd=${a.lawdCd}, aptName=${a.aptName}, ` +
          `전용면적 ${a.unitArea}m² ±1.5 안의 거래만 골라 중앙값을 만원 단위 정수로 price 에 넣고 ` +
          `trades 에 건수, source 를 real 로 바꾼다. 거래가 0건이면 손대지 말고 seed 로 둔다.`
        : `${a.symbol}(${a.name}) ${ym} 지수를 낸다. members 의 시군구 ${a.members.length}개를 돌며 ` +
          `아파트 매매 실거래를 모두 모아 중앙값을 만원 단위로 price 에 넣고 source 를 real 로 바꾼다. ` +
          `받은 원본은 data/raw/{lawdCd}-{ym}.json 에 저장해 두 번 받지 않는다.`,
      { symbol: a.symbol, ym }
    );
  }
}

for (const c of wish.candidates ?? []) {
  add(
    "add-asset",
    `후보 ${c.name ?? c}를 data/listings.json 에 종목으로 넣는다. data/SCHEMA.md 를 그대로 따르고, ` +
      `넣은 뒤 wishlist 에서 지운다. symbol 은 겹치지 않게 짓는다.`
  );
}

if (tasks.length === 0) {
  add(
    "idle",
    key
      ? `채울 게 없다. 아직 안 올린 단지를 20개 찾아 wishlist 에 넣는다.`
      : `키 없이 할 수 있는 일을 다 했다. 인증키를 넣어 달라고 사람에게 알리고, ` +
        `그때까지 wishlist 를 더 쌓는다.`
  );
}

console.log(`\n남은 일 ${tasks.length}건 — 위에서부터 ${Math.min(count, tasks.length)}건\n`);
tasks.slice(0, count).forEach((t, i) => console.log(`${i + 1}. [${t.kind}] ${t.say}\n`));
