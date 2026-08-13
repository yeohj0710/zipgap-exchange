import { MM, roundToTick, tickSize } from "./config";
import { nav } from "./market";
import type { Asset, BookLevel } from "./types";

/**
 * 마켓메이커.
 *
 * 실거래가(NAV) 하나만 보면 값이 한 달에 한 번 계단처럼 튄다. 그래서
 * 마켓메이커가 NAV 둘레에 양방향 호가를 깐다. 이 호가는 두 가지로 움직인다.
 *
 *  1. 시각만으로 정해지는 흔들림 — 주기가 다른 사인파를 겹쳐 만든다.
 *     서버와 브라우저가 같은 식을 쓰므로 누가 언제 보든 같은 값이 나오고,
 *     저장할 것도 없다.
 *  2. 재고 쏠림 — 사람들이 많이 사가면 마켓메이커 재고가 마이너스가 되고,
 *     그만큼 호가를 위로 민다. 사람이 몰리면 값이 오르는 이유가 이것이다.
 *
 * 그래서 시장가격은 NAV 위아래로 벌어진다. 그 벌어진 정도가 괴리율이다.
 */

function hash32(str: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

const PHASE_CACHE = new Map<string, number[]>();

function phases(symbol: string): number[] {
  const hit = PHASE_CACHE.get(symbol);
  if (hit) return hit;
  const h = hash32(symbol);
  const out = [0, 1, 2, 3, 4, 5].map(
    (i) => ((hash32(symbol + ":" + i) ^ h) % 100000) / 100000 * Math.PI * 2
  );
  PHASE_CACHE.set(symbol, out);
  return out;
}

const MIN = 60_000;
/** 주기(분)와 진폭. 합쳐서 대략 ±1.4% 안에서 논다 */
const WAVES: [number, number][] = [
  [2.6, 0.0016],
  [11, 0.0028],
  [47, 0.0042],
  [193, 0.0055],
  [1_440, 0.0068],
  [7_200, 0.0075],
];

/** 종목·시각만으로 정해지는 흔들림. -0.014 ~ 0.014 근처 */
export function drift(symbol: string, atMs: number): number {
  const ph = phases(symbol);
  let sum = 0;
  for (let i = 0; i < WAVES.length; i++) {
    const [periodMin, amp] = WAVES[i];
    sum += Math.sin((atMs / (periodMin * MIN)) * Math.PI * 2 + ph[i]) * amp;
  }
  return sum;
}

/** 시간이 지나면 마켓메이커 재고는 0 쪽으로 줄어든다 */
export function decayInventory(inventory: number, sinceMs: number, atMs: number): number {
  if (!inventory) return 0;
  const days = Math.max(0, (atMs - sinceMs) / (24 * 3600 * 1000));
  if (days <= 0) return inventory;
  return inventory * Math.pow(1 - MM.INVENTORY_DECAY_PER_DAY, days);
}

export function maxInventory(asset: Asset, atMs: number): number {
  const base = nav(asset, atMs);
  return base > 0 ? MM.MAX_INVENTORY_NOTIONAL / base : 0;
}

/** 마켓메이커 기준가. 사람 주문이 하나도 없어도 이 값은 계속 움직인다 */
export function mmMid(asset: Asset, atMs: number, inventory = 0): number {
  const base = nav(asset, atMs);
  const cap = maxInventory(asset, atMs);
  const skew = cap > 0 ? -(inventory / cap) * MM.SKEW : 0;
  const clamped = Math.max(-MM.SKEW, Math.min(MM.SKEW, skew));
  return base * (1 + drift(asset.symbol, atMs)) * (1 + clamped);
}

/** 마켓메이커가 한 단에 걸어두는 수량 */
function levelQty(asset: Asset, mid: number, level: number): number {
  if (mid <= 0) return 0;
  const base = MM.BASE_NOTIONAL / mid;
  return Math.max(1, Math.round(base * (1 + level * MM.DEPTH_GROWTH)));
}

/**
 * 마켓메이커 호가 사다리.
 * 재고 한도를 넘긴 방향은 더 이상 내지 않는다.
 */
export function mmLadder(
  asset: Asset,
  atMs: number,
  inventory: number
): { bids: BookLevel[]; asks: BookLevel[] } {
  const mid = mmMid(asset, atMs, inventory);
  const cap = maxInventory(asset, atMs);
  const t = tickSize(mid);
  const bids: BookLevel[] = [];
  const asks: BookLevel[] = [];

  // 재고가 한도에 가까울수록 그 방향 물량을 줄인다
  const buyRoom = cap > 0 ? Math.max(0, 1 - inventory / cap) : 0;
  const sellRoom = cap > 0 ? Math.max(0, 1 + inventory / cap) : 0;

  for (let i = 0; i < MM.LEVELS; i++) {
    const off = mid * MM.SPREAD + i * t;
    const bidPrice = roundToTick(mid - off, "down");
    const askPrice = roundToTick(mid + off, "up");
    const q = levelQty(asset, mid, i);
    const bq = Math.floor(q * buyRoom);
    const aq = Math.floor(q * sellRoom);
    if (bidPrice > 0 && bq > 0) bids.push({ price: bidPrice, qty: bq, mm: true });
    if (aq > 0) asks.push({ price: askPrice, qty: aq, mm: true });
  }
  return { bids, asks };
}

/** 사람 주문과 마켓메이커 호가를 한 장으로 합친다 */
export function mergeLevels(
  human: BookLevel[],
  mm: BookLevel[],
  side: "bid" | "ask",
  depth: number
): BookLevel[] {
  const map = new Map<number, BookLevel>();
  for (const l of human) {
    const cur = map.get(l.price);
    if (cur) cur.qty += l.qty;
    else map.set(l.price, { price: l.price, qty: l.qty });
  }
  for (const l of mm) {
    const cur = map.get(l.price);
    if (cur) {
      cur.qty += l.qty;
      cur.mm = true;
    } else {
      map.set(l.price, { price: l.price, qty: l.qty, mm: true });
    }
  }
  const arr = [...map.values()];
  arr.sort((a, b) => (side === "bid" ? b.price - a.price : a.price - b.price));
  return arr.slice(0, depth);
}

/** 실물 실거래가 대비 시장가격이 얼마나 벌어졌는지 */
export function premium(asset: Asset, marketPrice: number, atMs: number): number {
  const base = nav(asset, atMs);
  if (base <= 0) return 0;
  return (marketPrice - base) / base;
}
