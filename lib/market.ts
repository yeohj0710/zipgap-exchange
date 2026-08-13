import listings from "@/data/listings.json";
import type { Asset, Listings, PricePoint } from "./types";

const DATA = listings as unknown as Listings;

export const LISTINGS_VERSION = DATA.version;
export const LISTINGS_STATUS = DATA.status;
export const LISTINGS_NOTE = DATA.note;

const BY_SYMBOL = new Map<string, Asset>(DATA.assets.map((a) => [a.symbol, a]));

export function getAssets(): Asset[] {
  return DATA.assets;
}

export function getAsset(symbol: string): Asset | null {
  return BY_SYMBOL.get(symbol.toUpperCase()) ?? null;
}

export function isRealData(asset: Asset): boolean {
  return asset.history.some((p) => p.source === "real");
}

/** YYYY-MM 을 그 달 1일 09:00 KST 에 해당하는 ms 로 바꾼다 */
export function ymToMs(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return Date.UTC(y, m - 1, 1, 0, 0, 0) - 9 * 3600 * 1000;
}

export function msToYm(ms: number): string {
  const d = new Date(ms + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** 만원 단위 실물가격을 1주 가격(원)으로 바꾼다 */
export function toSharePrice(asset: Asset, manwon: number): number {
  return (manwon * 10_000) / asset.shareDivisor;
}

interface Anchor {
  t: number;
  v: number;
}

const ANCHOR_CACHE = new Map<string, Anchor[]>();

function anchors(asset: Asset): Anchor[] {
  const hit = ANCHOR_CACHE.get(asset.symbol);
  if (hit) return hit;
  const built = asset.history
    .slice()
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .map((p: PricePoint) => ({ t: ymToMs(p.ym), v: toSharePrice(asset, p.price) }));
  ANCHOR_CACHE.set(asset.symbol, built);
  return built;
}

const MONTH_MS = 30.44 * 24 * 3600 * 1000;

/**
 * 기초자산 가치(NAV)를 원 단위 주가로 돌려준다.
 *
 * 월별 실거래 앵커 사이는 로그 선형으로 잇는다. 마지막 앵커 이후는
 * 최근 6개월 기울기를 감쇠시켜 잇되, 12개월이 지나면 평평하게 둔다.
 * 자료가 늦게 들어오는 동안 값이 폭주하지 않게 하려는 것이다.
 */
export function nav(asset: Asset, atMs: number): number {
  const a = anchors(asset);
  if (a.length === 0) return 0;
  if (a.length === 1) return a[0].v;

  if (atMs <= a[0].t) return a[0].v;

  for (let i = 0; i < a.length - 1; i++) {
    const p = a[i];
    const q = a[i + 1];
    if (atMs <= q.t) {
      const w = (atMs - p.t) / (q.t - p.t);
      return Math.exp(Math.log(p.v) + (Math.log(q.v) - Math.log(p.v)) * w);
    }
  }

  // 마지막 앵커 이후 외삽
  const last = a[a.length - 1];
  const backIdx = Math.max(0, a.length - 7);
  const back = a[backIdx];
  const spanMonths = Math.max(1, (last.t - back.t) / MONTH_MS);
  const perMonth = (Math.log(last.v) - Math.log(back.v)) / spanMonths;
  const capped = Math.max(-0.01, Math.min(0.01, perMonth));
  const monthsAhead = (atMs - last.t) / MONTH_MS;
  // 12개월에 걸쳐 기울기를 0으로 줄인다
  const decayed = capped * Math.min(monthsAhead, 12) * (1 - Math.min(monthsAhead, 12) / 24);
  return Math.exp(Math.log(last.v) + decayed);
}

/** 전월 대비 실거래가 변화율 */
export function navMonthlyChange(asset: Asset): number {
  const h = asset.history;
  if (h.length < 2) return 0;
  const a = h[h.length - 2].price;
  const b = h[h.length - 1].price;
  return a === 0 ? 0 : (b - a) / a;
}

/** 최근 12개월 실거래가 변화율 */
export function navYearlyChange(asset: Asset): number {
  const h = asset.history;
  if (h.length < 13) return 0;
  const a = h[h.length - 13].price;
  const b = h[h.length - 1].price;
  return a === 0 ? 0 : (b - a) / a;
}

/** 실물 한 채 가격(만원) */
export function lastRealPrice(asset: Asset): number {
  const h = asset.history;
  return h.length ? h[h.length - 1].price : 0;
}
