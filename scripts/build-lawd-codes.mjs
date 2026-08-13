// data/lawd-codes.json 을 만든다.
//
// 원본은 행정표준코드관리시스템(code.go.kr)의 "법정동코드 전체자료"다.
// EUC-KR 탭 구분 텍스트이고 줄 모양은 이렇다.
//   법정동코드(10자리) \t 법정동명 \t 폐지여부
//
//   node scripts/build-lawd-codes.mjs <원본파일>
//   node scripts/build-lawd-codes.mjs --url <내려받을 주소>
//
// 국토부 실거래가 API 의 LAWD_CD 는 시군구 5자리다.
// 법정동코드 10자리는 시도(2) + 시군구(3) + 읍면동(3) + 리(2) 로 끊어진다.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = resolve(ROOT, "data", "lawd-codes.json");

const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");
const url = urlIdx >= 0 ? args[urlIdx + 1] : null;
const file = args.find((a, i) => !a.startsWith("--") && !(urlIdx >= 0 && i === urlIdx + 1));

async function load() {
  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`내려받기 실패 ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  if (!file || !existsSync(file)) {
    console.error("원본 파일 경로나 --url 을 넣어 주세요.");
    console.error("  code.go.kr > 법정동코드 > 전체자료 내려받기");
    process.exit(1);
  }
  return readFileSync(file);
}

const text = new TextDecoder("euc-kr").decode(await load());
const lines = text.split(/\r?\n/).filter(Boolean);

const head = lines[0].split("\t");
if (!head[0].includes("법정동코드")) {
  console.error(`머리줄이 예상과 다릅니다: ${lines[0].slice(0, 80)}`);
  process.exit(1);
}

const sigungu = [];
const dong = {};
let dropped = 0;

for (const line of lines.slice(1)) {
  const [code, name, alive] = line.split("\t");
  if (!code || code.length !== 10) continue;
  if (alive && alive.trim() !== "존재") {
    dropped++;
    continue;
  }

  const sido = code.slice(0, 2);
  const sgg = code.slice(2, 5);
  const emd = code.slice(5, 8);
  const ri = code.slice(8, 10);

  // 시군구 단위: 읍면동과 리가 모두 0 이고 시군구가 0 이 아니다
  if (sgg !== "000" && emd === "000" && ri === "00") {
    sigungu.push({ code: code.slice(0, 5), name: name.trim() });
    continue;
  }
  // 읍면동 단위
  if (sgg !== "000" && emd !== "000" && ri === "00") {
    const key = code.slice(0, 5);
    (dong[key] ??= []).push({ code: code.slice(0, 8), name: name.trim() });
  }
}

sigungu.sort((a, b) => a.code.localeCompare(b.code));

const out = {
  source: "행정표준코드관리시스템(code.go.kr) 법정동코드 전체자료",
  note:
    "국토부 실거래가 API 의 LAWD_CD 는 여기 sigungu.code(5자리)를 쓴다. " +
    "폐지된 코드는 뺐다. 시군구가 없는 세종시 같은 곳은 시 자체가 시군구 자리에 온다.",
  builtFrom: url ?? file,
  sigunguCount: sigungu.length,
  sigungu,
  dong,
};

writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n", "utf8");

const kb = Math.round(Buffer.byteLength(JSON.stringify(out)) / 1024);
console.log(`시군구 ${sigungu.length}개 · 읍면동 ${Object.values(dong).flat().length}개 · 폐지 제외 ${dropped}건 · ${kb}KB`);
console.log(`예: ${sigungu.filter((s) => /강남구|해운대구|영통구|분당구/.test(s.name)).map((s) => `${s.code} ${s.name}`).join(" / ")}`);
