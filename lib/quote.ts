import { RULES } from "./config";
import { buildBookLevels } from "./engine";
import { nav } from "./market";
import { decayInventory, mmMid } from "./pricing";
import type { Asset, BookLevel, Order } from "./types";
import type { BookState } from "./store/types";

/** 한국 시각 기준 오늘 0시 */
function startOfDay(now: number): number {
  const kst = now + 9 * 3600 * 1000;
  return Math.floor(kst / 86_400_000) * 86_400_000 - 9 * 3600 * 1000;
}

export interface Quote {
  symbol: string;
  /** 지금 값 */
  price: number;
  /** 기초자산 가치 */
  navPrice: number;
  /** 기초자산 대비 얼마나 벌어졌는지 */
  premium: number;
  prevClose: number;
  change: number;
  changeRate: number;
  bid: number;
  ask: number;
  volume: number;
  mmInventory: number;
  /** 사람 거래가 한 번이라도 있었는지 */
  traded: boolean;
}

/**
 * 호가 문서 하나와 지금 시각만으로 시세를 만든다.
 * 서버와 브라우저가 같은 함수를 쓰므로 값이 어긋나지 않는다.
 */
export function quoteOf(asset: Asset, book: BookState, now: number): Quote {
  const inv = decayInventory(book.mmInventory ?? 0, book.mmUpdatedAt ?? now, now);
  const mid = mmMid(asset, now, inv);
  const navPrice = nav(asset, now);

  // 마지막 체결가는 시간이 지나면 마켓메이커 기준가 쪽으로 돌아온다
  let price = mid;
  if (book.last > 0) {
    const ageMin = (now - (book.updatedAt || now)) / 60_000;
    const w = Math.min(1, Math.max(0, ageMin / 30));
    price = book.last * (1 - w) + mid * w;
  }

  const levels = bookLevels(asset, book, now);
  // 거래가 아직 없으면 오늘 0시의 마켓메이커 기준가를 전일 종가로 삼는다.
  // 실거래가를 그대로 쓰면 전일대비와 괴리율이 같은 숫자가 되어 버린다.
  const prevClose = book.prevClose > 0 ? book.prevClose : mmMid(asset, startOfDay(now), 0);

  return {
    symbol: asset.symbol,
    price,
    navPrice,
    premium: navPrice > 0 ? (price - navPrice) / navPrice : 0,
    prevClose,
    change: price - prevClose,
    changeRate: prevClose > 0 ? (price - prevClose) / prevClose : 0,
    bid: levels.bids[0]?.price ?? 0,
    ask: levels.asks[0]?.price ?? 0,
    volume: book.volume ?? 0,
    mmInventory: inv,
    traded: book.last > 0,
  };
}

/** 사람 미체결 물량과 마켓메이커 호가를 합친 호가창 */
export function bookLevels(
  asset: Asset,
  book: BookState,
  now: number,
  depth: number = RULES.BOOK_DEPTH
): { bids: BookLevel[]; asks: BookLevel[] } {
  const inv = decayInventory(book.mmInventory ?? 0, book.mmUpdatedAt ?? now, now);
  const fake: Order[] = [];
  let i = 0;
  for (const l of book.humanBids ?? []) {
    fake.push(asOrder(`b${i++}`, asset.symbol, "buy", l.price, l.qty));
  }
  for (const l of book.humanAsks ?? []) {
    fake.push(asOrder(`a${i++}`, asset.symbol, "sell", l.price, l.qty));
  }
  return buildBookLevels(asset, now, inv, fake, depth);
}

function asOrder(
  id: string,
  symbol: string,
  side: "buy" | "sell",
  price: number,
  qty: number
): Order {
  return {
    id,
    uid: "-",
    nick: "-",
    symbol,
    side,
    type: "limit",
    price,
    qty,
    filledQty: 0,
    filledAmount: 0,
    status: "open",
    createdAt: 0,
    updatedAt: 0,
  };
}
