// 단지의 region 문자열을 법정동코드 표와 맞춰 lawdCd 를 확정한다.
//
//   node scripts/resolve-lawd.mjs          (맞춰만 보고 결과를 보여 준다)
//   node scripts/resolve-lawd.mjs --write  (listings.json 에 써 넣는다)
//
// 짐작으로 넣지 않는다. 시군구 이름이 맞고, 그 시군구 아래에 region 의
// 읍면동이 실제로 있을 때만 확정으로 친다. 둘 중 하나라도 어긋나면 남겨 둔다.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const LIST = resolve(ROOT, "data", "listings.json");
const CODES = resolve(ROOT, "data", "lawd-codes.json");
const write = process.argv.includes("--write");

const listings = JSON.parse(readFileSync(LIST, "utf8"));
const codes = JSON.parse(readFileSync(CODES, "utf8"));

// 짧은 이름 → 정식 이름
const SIDO = {
  서울: "서울특별시",
  부산: "부산광역시",
  대구: "대구광역시",
  인천: "인천광역시",
  광주: "광주광역시",
  대전: "대전광역시",
  울산: "울산광역시",
  세종: "세종특별자치시",
  경기: "경기도",
  강원: "강원특별자치도",
  충북: "충청북도",
  충남: "충청남도",
  전북: "전북특별자치도",
  전남: "전라남도",
  경북: "경상북도",
  경남: "경상남도",
  제주: "제주특별자치도",
};

/** "서울 강남구 대치동" → { sido, parts:[강남구, 대치동] } */
function parse(region) {
  const t = region.trim().split(/\s+/);
  const sido = SIDO[t[0]] ?? t[0];
  return { sido, parts: t.slice(1) };
}

function resolveOne(region) {
  const { sido, parts } = parse(region);
  if (!parts.length) return { ok: false, why: "시군구가 없습니다" };

  // 시군구는 뒤에서부터 붙여 본다. "성남시 분당구" 같은 두 마디를 잡으려는 것
  const candidates = [];
  for (let take = Math.min(2, parts.length); take >= 1; take--) {
    const label = parts.slice(0, take).join(" ");
    const full = `${sido} ${label}`;
    const hit = codes.sigungu.find((s) => s.name === full);
    if (hit) candidates.push({ hit, used: take });
  }
  if (!candidates.length) return { ok: false, why: `시군구를 못 찾았습니다 (${sido} ${parts[0]})` };

  const { hit, used } = candidates[0];
  const emdName = parts[used];
  if (!emdName) return { ok: true, code: hit.code, name: hit.name, emd: null, why: "읍면동 없음" };

  // 코드표의 이름은 "서울특별시 강남구 대치동" 처럼 전체 이름이다. 끝 마디만 본다
  const tail = (s) => s.trim().split(/\s+/).pop();
  const list = codes.dong[hit.code] ?? [];
  const emd = list.find((d) => tail(d.name) === emdName);
  if (!emd) {
    const near = list
      .filter((d) => tail(d.name).startsWith(emdName.slice(0, 2)))
      .slice(0, 4)
      .map((d) => tail(d.name));
    return {
      ok: false,
      why: `${hit.name} 아래에 '${emdName}' 이 없습니다${near.length ? ` (비슷한 것: ${near.join(", ")})` : ""}`,
      code: hit.code,
    };
  }
  return { ok: true, code: hit.code, name: hit.name, emd: tail(emd.name), emdCode: emd.code };
}

// 지수 종목이 어느 시군구로 이뤄지는지. 이것도 짐작이 아니라 코드표로 맞춘다
const INDEX_RULES = {
  KOR: { all: true },
  SEOUL: { sidoPrefix: ["11"] },
  GG: { sidoPrefix: ["41"] },
  GN3: { names: ["서울특별시 강남구", "서울특별시 서초구", "서울특별시 송파구"] },
  // 5대 광역시: 부산 대구 인천 광주 대전
  METRO5: { sidoPrefix: ["26", "27", "28", "29", "30"] },
  NEWTOWN: {
    names: [
      "경기도 성남시 분당구",
      "경기도 고양시 일산동구",
      "경기도 고양시 일산서구",
      "경기도 안양시 동안구",
      "경기도 군포시",
      "경기도 부천시",
    ],
  },
};

function resolveIndex(symbol) {
  const rule = INDEX_RULES[symbol];
  if (!rule) return null;
  if (rule.all) return { codes: codes.sigungu.map((s) => s.code), missing: [] };
  if (rule.sidoPrefix) {
    return {
      codes: codes.sigungu.filter((s) => rule.sidoPrefix.includes(s.code.slice(0, 2))).map((s) => s.code),
      missing: [],
    };
  }
  const out = [];
  const missing = [];
  for (const n of rule.names) {
    const hit = codes.sigungu.find((s) => s.name === n);
    if (hit) out.push(hit.code);
    else missing.push(n);
  }
  return { codes: out, missing };
}

let done = 0;
let left = 0;
for (const a of listings.assets) {
  if (a.kind !== "complex") continue;
  const r = resolveOne(a.region);
  if (r.ok) {
    done++;
    const mark = a.lawdCd && a.lawdCd !== r.code ? `  (기존 ${a.lawdCd} 와 다름)` : "";
    console.log(`  확정  ${a.symbol.padEnd(10)} ${r.code}  ${r.name} ${r.emd ?? ""}${mark}`);
    if (write) a.lawdCd = r.code;
  } else {
    left++;
    console.log(`  보류  ${a.symbol.padEnd(10)} ${r.why}`);
  }
}

console.log(`\n확정 ${done}개 · 보류 ${left}개`);

console.log(`\n지수 구성 시군구`);
for (const a of listings.assets) {
  if (a.kind !== "index") continue;
  const r = resolveIndex(a.symbol);
  if (!r) {
    console.log(`  보류  ${a.symbol.padEnd(10)} 구성 규칙이 없습니다`);
    left++;
    continue;
  }
  if (r.missing.length) {
    console.log(`  보류  ${a.symbol.padEnd(10)} 코드표에 없는 이름: ${r.missing.join(", ")}`);
    left++;
    continue;
  }
  console.log(`  확정  ${a.symbol.padEnd(10)} 시군구 ${r.codes.length}개`);
  if (write) a.members = r.codes;
}

// 후보 목록도 같이 봐 준다. 종목으로 올리기 전에 region 표기를 잡아 두려는 것
const WISH = resolve(ROOT, "data", "wishlist.json");
if (existsSync(WISH)) {
  const wish = JSON.parse(readFileSync(WISH, "utf8"));
  const cands = wish.candidates ?? [];
  if (cands.length) {
    console.log(`\n후보 목록 ${cands.length}개`);
    let bad = 0;
    for (const c of cands) {
      if (!c.region) {
        console.log(`  보류  ${c.name ?? c} — region 이 없습니다`);
        bad++;
        continue;
      }
      const r = resolveOne(c.region);
      if (r.ok) {
        if (write) c.lawdCd = r.code;
      } else {
        console.log(`  보류  ${c.name ?? c} — ${r.why}`);
        bad++;
      }
    }
    console.log(`  쓸 수 있는 후보 ${cands.length - bad}개 · 손봐야 할 것 ${bad}개`);
    if (write) writeFileSync(WISH, JSON.stringify(wish, null, 2) + "\n", "utf8");
  }
}

if (write) {
  writeFileSync(LIST, JSON.stringify(listings, null, 2) + "\n", "utf8");
  console.log("\nlistings.json 에 써 넣었습니다.");
} else {
  console.log("\n실제로 넣으려면 --write 를 붙이세요.");
}
