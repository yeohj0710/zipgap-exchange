import { MM, RULES } from "./config";
import { mmLadder } from "./pricing";
import type { Asset, BookLevel, Order, Side } from "./types";

/**
 * 매칭 엔진. 저장소를 모른다.
 * 호가 상태와 들어온 주문만 받아서 체결 결과를 계산한다.
 */

export interface LiquidityUnit {
  price: number;
  qty: number;
  /** 사람 주문이면 주문 id. 없으면 마켓메이커 */
  orderId?: string;
  uid?: string;
  nick?: string;
}

export interface Fill {
  price: number;
  qty: number;
  orderId?: string;
  uid?: string;
  nick?: string;
  mm: boolean;
}

export interface MatchOutcome {
  fills: Fill[];
  filledQty: number;
  filledAmount: number;
  remainingQty: number;
  /** 마켓메이커 재고 변화. 마켓메이커가 산 만큼 양수 */
  mmDelta: number;
}

/** 사람 미체결 주문과 마켓메이커 호가를 섞어 체결 순서대로 늘어놓는다 */
export function buildUnits(
  takerSide: Side,
  asset: Asset,
  now: number,
  mmInventory: number,
  resting: Order[]
): LiquidityUnit[] {
  const wantSide: Side = takerSide === "buy" ? "sell" : "buy";
  const ladder = mmLadder(asset, now, mmInventory);
  const mmSide = takerSide === "buy" ? ladder.asks : ladder.bids;

  const units: LiquidityUnit[] = [];
  for (const o of resting) {
    if (o.side !== wantSide) continue;
    if (o.status !== "open") continue;
    const left = o.qty - o.filledQty;
    if (left <= 0) continue;
    units.push({ price: o.price, qty: left, orderId: o.id, uid: o.uid, nick: o.nick });
  }
  for (const l of mmSide) {
    if (l.qty > 0) units.push({ price: l.price, qty: l.qty });
  }

  units.sort((a, b) => {
    if (a.price !== b.price) {
      return takerSide === "buy" ? a.price - b.price : b.price - a.price;
    }
    // 같은 값이면 사람 주문이 먼저 체결된다
    const am = a.orderId ? 0 : 1;
    const bm = b.orderId ? 0 : 1;
    return am - bm;
  });
  return units;
}

export function match(
  units: LiquidityUnit[],
  takerSide: Side,
  qty: number,
  limitPrice: number | null,
  /** 예산 한도. 시장가 매수에서 예수금을 넘지 않게 쓴다 */
  cashCap: number | null = null
): MatchOutcome {
  const fills: Fill[] = [];
  let remaining = qty;
  let filledAmount = 0;
  let mmDelta = 0;
  let legs = 0;

  for (const u of units) {
    if (remaining <= 0) break;
    if (legs >= RULES.MAX_MATCH_LEGS) break;
    if (limitPrice !== null) {
      if (takerSide === "buy" && u.price > limitPrice) break;
      if (takerSide === "sell" && u.price < limitPrice) break;
    }
    let take = Math.min(remaining, u.qty);
    if (cashCap !== null && takerSide === "buy") {
      const budget = cashCap - filledAmount;
      const affordable = Math.floor(budget / (u.price * (1 + RULES.FEE_RATE)));
      take = Math.min(take, Math.max(0, affordable));
    }
    if (take <= 0) break;

    fills.push({
      price: u.price,
      qty: take,
      orderId: u.orderId,
      uid: u.uid,
      nick: u.nick,
      mm: !u.orderId,
    });
    remaining -= take;
    filledAmount += take * u.price;
    if (!u.orderId) mmDelta += takerSide === "buy" ? -take : take;
    legs++;
  }

  return {
    fills,
    filledQty: qty - remaining,
    filledAmount,
    remainingQty: remaining,
    mmDelta,
  };
}

/** 화면에 뿌릴 호가창을 만든다 */
export function buildBookLevels(
  asset: Asset,
  now: number,
  mmInventory: number,
  resting: Order[],
  depth: number = RULES.BOOK_DEPTH
): { bids: BookLevel[]; asks: BookLevel[] } {
  const ladder = mmLadder(asset, now, mmInventory);
  const humanBid = new Map<number, number>();
  const humanAsk = new Map<number, number>();
  for (const o of resting) {
    if (o.status !== "open") continue;
    const left = o.qty - o.filledQty;
    if (left <= 0) continue;
    const m = o.side === "buy" ? humanBid : humanAsk;
    m.set(o.price, (m.get(o.price) ?? 0) + left);
  }

  const fold = (
    human: Map<number, number>,
    mm: BookLevel[],
    side: "bid" | "ask"
  ): BookLevel[] => {
    const map = new Map<number, BookLevel>();
    for (const [price, qty] of human) map.set(price, { price, qty });
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
  };

  return {
    bids: fold(humanBid, ladder.bids, "bid"),
    asks: fold(humanAsk, ladder.asks, "ask"),
  };
}

export function feeOf(amount: number): number {
  return Math.floor(amount * RULES.FEE_RATE);
}

/** 시장가 주문이 없을 때 쓰는 참고가 */
export function bestPrices(levels: { bids: BookLevel[]; asks: BookLevel[] }) {
  return {
    bid: levels.bids[0]?.price ?? 0,
    ask: levels.asks[0]?.price ?? 0,
  };
}

export const MM_LIMITS = MM;
