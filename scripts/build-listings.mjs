// data/listings.json 을 만든다.
//
// 지금 들어 있는 값은 전부 "시드 추정치"다. 실거래 원자료를 아직 안 붙였다.
// 앵커(시작가·끝가)만 사람이 정하고, 그 사이 월별 값은 로그 선형 보간에
// 종목별 고정 시드 노이즈를 얹어 만든다. 같은 시드면 항상 같은 값이 나온다.
//
// Codex 가 실거래 자료를 붙일 때는 이 스크립트를 다시 돌리지 말고
// data/listings.json 의 history 를 source:"real" 항목으로 갈아끼운다.
// 자세한 규칙은 data/SCHEMA.md 에 있다.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, "..", "data", "listings.json");

const START_YM = "2024-01";
const END_YM = "2026-08";

/** 종목 앵커. from/to 는 대표 거래가(만원). */
const SPECS = [
  // ── 지수 ──────────────────────────────────────────────────────────
  {
    symbol: "KOR",
    name: "전국 아파트 종합",
    alias: "전국",
    kind: "index",
    sido: "전국",
    region: "전국 아파트 매매 실거래 종합",
    tags: ["지수", "대표"],
    rentYield: 0.031,
    from: 44000,
    to: 46500,
    vol: 0.004,
  },
  {
    symbol: "SEOUL",
    name: "서울 아파트",
    alias: "서울",
    kind: "index",
    sido: "서울",
    region: "서울 25개 자치구 아파트",
    tags: ["지수"],
    rentYield: 0.021,
    from: 105000,
    to: 128000,
    vol: 0.005,
  },
  {
    symbol: "GN3",
    name: "강남3구",
    alias: "강남3구",
    kind: "index",
    sido: "서울",
    region: "강남·서초·송파",
    tags: ["지수", "고가"],
    rentYield: 0.017,
    from: 210000,
    to: 265000,
    vol: 0.007,
  },
  {
    symbol: "GG",
    name: "경기 아파트",
    alias: "경기",
    kind: "index",
    sido: "경기",
    region: "경기도 전역 아파트",
    tags: ["지수"],
    rentYield: 0.029,
    from: 56000,
    to: 60000,
    vol: 0.004,
  },
  {
    symbol: "METRO5",
    name: "5대 광역시",
    alias: "광역시",
    kind: "index",
    sido: "광역시",
    region: "부산·대구·인천·광주·대전",
    tags: ["지수"],
    rentYield: 0.036,
    from: 38000,
    to: 37200,
    vol: 0.005,
  },
  {
    symbol: "NEWTOWN",
    name: "1기 신도시",
    alias: "1기신도시",
    kind: "index",
    sido: "경기",
    region: "분당·일산·평촌·산본·중동",
    tags: ["지수", "재건축"],
    rentYield: 0.025,
    from: 78000,
    to: 92000,
    vol: 0.009,
  },

  // ── 개별 단지 ─────────────────────────────────────────────────────
  {
    symbol: "EUNMA",
    name: "은마아파트",
    alias: "은마",
    kind: "complex",
    sido: "서울",
    region: "서울 강남구 대치동",
    unitArea: 84.43,
    households: 4424,
    builtYear: 1979,
    tags: ["재건축", "학군"],
    rentYield: 0.014,
    from: 245000,
    to: 285000,
    vol: 0.012,
  },
  {
    symbol: "ELS",
    name: "잠실 엘스",
    alias: "엘스",
    kind: "complex",
    sido: "서울",
    region: "서울 송파구 잠실동",
    unitArea: 84.8,
    households: 5678,
    builtYear: 2008,
    tags: ["대단지", "한강"],
    rentYield: 0.018,
    from: 225000,
    to: 268000,
    vol: 0.009,
  },
  {
    symbol: "HELIO",
    name: "헬리오시티",
    alias: "헬리오",
    kind: "complex",
    sido: "서울",
    region: "서울 송파구 가락동",
    unitArea: 84.99,
    households: 9510,
    builtYear: 2018,
    tags: ["대단지", "신축"],
    rentYield: 0.019,
    from: 205000,
    to: 245000,
    vol: 0.008,
  },
  {
    symbol: "ARIPARK",
    name: "아크로리버파크",
    alias: "아리팍",
    kind: "complex",
    sido: "서울",
    region: "서울 서초구 반포동",
    unitArea: 84.97,
    households: 1612,
    builtYear: 2016,
    tags: ["한강", "최고가"],
    rentYield: 0.013,
    from: 420000,
    to: 510000,
    vol: 0.011,
  },
  {
    symbol: "BANPO",
    name: "반포래미안퍼스티지",
    alias: "반래퍼",
    kind: "complex",
    sido: "서울",
    region: "서울 서초구 반포동",
    unitArea: 84.93,
    households: 2444,
    builtYear: 2009,
    tags: ["한강", "고가"],
    rentYield: 0.014,
    from: 390000,
    to: 470000,
    vol: 0.01,
  },
  {
    symbol: "MRP",
    name: "마포래미안푸르지오",
    alias: "마래푸",
    kind: "complex",
    sido: "서울",
    region: "서울 마포구 아현동",
    unitArea: 84.89,
    households: 3885,
    builtYear: 2014,
    tags: ["대단지", "도심"],
    rentYield: 0.019,
    from: 165000,
    to: 195000,
    vol: 0.009,
  },
  {
    symbol: "MOKDONG7",
    name: "목동신시가지7단지",
    alias: "목동7",
    kind: "complex",
    sido: "서울",
    region: "서울 양천구 목동",
    unitArea: 66.6,
    households: 2550,
    builtYear: 1986,
    tags: ["재건축", "학군"],
    rentYield: 0.015,
    from: 195000,
    to: 230000,
    vol: 0.013,
  },
  {
    symbol: "GAEPO",
    name: "개포자이프레지던스",
    alias: "개포자이",
    kind: "complex",
    sido: "서울",
    region: "서울 강남구 개포동",
    unitArea: 84.9,
    households: 3375,
    builtYear: 2023,
    tags: ["신축", "대단지"],
    rentYield: 0.016,
    from: 290000,
    to: 340000,
    vol: 0.01,
  },
  {
    symbol: "PANGYO",
    name: "판교 봇들마을8단지",
    alias: "판교봇들",
    kind: "complex",
    sido: "경기",
    region: "경기 성남시 분당구 삼평동",
    unitArea: 84.9,
    households: 447,
    builtYear: 2009,
    tags: ["판교", "직주근접"],
    rentYield: 0.021,
    from: 175000,
    to: 205000,
    vol: 0.011,
  },
  {
    symbol: "GWANGGYO",
    name: "광교 자연앤힐스테이트",
    alias: "광교힐스",
    kind: "complex",
    sido: "경기",
    region: "경기 수원시 영통구 이의동",
    unitArea: 84.9,
    households: 1764,
    builtYear: 2012,
    tags: ["신도시"],
    rentYield: 0.024,
    from: 118000,
    to: 128000,
    vol: 0.009,
  },
  {
    symbol: "SONGDO",
    name: "송도 더샵퍼스트파크",
    alias: "송도더샵",
    kind: "complex",
    sido: "인천",
    region: "인천 연수구 송도동",
    unitArea: 84.9,
    households: 1310,
    builtYear: 2017,
    tags: ["신도시", "국제도시"],
    rentYield: 0.028,
    from: 92000,
    to: 95000,
    vol: 0.012,
  },
  {
    symbol: "HAEUNDAE",
    name: "해운대 두산위브더제니스",
    alias: "위브제니스",
    kind: "complex",
    sido: "부산",
    region: "부산 해운대구 우동",
    unitArea: 84.9,
    households: 1788,
    builtYear: 2011,
    tags: ["바다", "초고층"],
    rentYield: 0.03,
    from: 96000,
    to: 102000,
    vol: 0.013,
  },
];

// ── 결정론적 난수 ───────────────────────────────────────────────────
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** -1 ~ 1 근처의 종 모양 난수 */
function gauss(rand) {
  return (rand() + rand() + rand() - 1.5) / 1.5;
}

function ymList(start, end) {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const out = [];
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function buildHistory(spec) {
  const months = ymList(START_YM, END_YM);
  const rand = rng(hash32(spec.symbol));
  const n = months.length - 1;
  // 누적 노이즈를 써야 계단이 아니라 추세처럼 보인다.
  let drift = 0;
  return months.map((ym, i) => {
    const t = n === 0 ? 1 : i / n;
    const base = Math.exp(
      Math.log(spec.from) + (Math.log(spec.to) - Math.log(spec.from)) * t
    );
    drift = drift * 0.72 + gauss(rand) * spec.vol;
    // 봄·가을 이사철에 조금 더 오르는 계절성
    const month = Number(ym.split("-")[1]);
    const season = Math.sin(((month - 2) / 12) * Math.PI * 2) * spec.vol * 0.35;
    const price = base * (1 + drift + season);
    const step = spec.kind === "index" ? 10 : 100;
    const rounded = Math.round(price / step) * step;
    const tradeBase = spec.kind === "index" ? 9000 : (spec.households ?? 800) / 90;
    return {
      ym,
      price: rounded,
      trades: Math.max(1, Math.round(tradeBase * (0.6 + rand() * 0.8))),
      source: "seed",
    };
  });
}

const assets = SPECS.map((spec) => ({
  symbol: spec.symbol,
  name: spec.name,
  alias: spec.alias,
  kind: spec.kind,
  sido: spec.sido,
  region: spec.region,
  ...(spec.unitArea ? { unitArea: spec.unitArea } : {}),
  ...(spec.households ? { households: spec.households } : {}),
  ...(spec.builtYear ? { builtYear: spec.builtYear } : {}),
  tags: spec.tags,
  rentYield: spec.rentYield,
  shareDivisor: 100000,
  history: buildHistory(spec),
}));

const out = {
  version: END_YM + "-13",
  status: "seed-estimate",
  note:
    "값은 전부 시드 추정치다. 실거래 원자료를 아직 안 붙였다. " +
    "history 의 source 가 real 인 항목만 실제 거래 자료다.",
  assets,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(
  `listings.json 생성: 종목 ${assets.length}개, 월 ${assets[0].history.length}개`
);
