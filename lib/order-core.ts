import { RULES, roundToTick, tickSize } from "./config";
import { buildUnits, buildBookLevels, feeOf, match } from "./engine";
import { decayInventory, mmMid } from "./pricing";
import type { Account, Asset, Candle, Order, Side, Trade } from "./types";
import type { BookState, FillRecord, HoldingRow, OrderInput, SubmitResult } from "./store/types";

/** 저장소가 채워 줘야 하는 것들. 쓰기는 전부 버퍼에 모았다가 마지막에 반영한다 */
export interface Ctx {
  now: number;
  book: BookState;
  getAccount(uid: string): Promise<Account | null>;
  getHolding(uid: string, symbol: string): Promise<HoldingRow>;
  getRestingOrders(symbol: string, side: Side): Promise<Order[]>;
  getOrder(id: string): Promise<Order | null>;
  putAccount(a: Account): void;
  putHolding(uid: string, h: HoldingRow): void;
  putOrder(o: Order): void;
  putFill(rec: FillRecord): void;
  newId(): string;
}

export class OrderError extends Error {}

const CANDLE_MS = 60_000;
const CANDLE_KEEP = 240;

function ymd(now: number): string {
  const d = new Date(now + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
}

export function emptyHolding(symbol: string): HoldingRow {
  return { symbol, qty: 0, locked: 0, avgPrice: 0 };
}

/** 사람 미체결 주문을 값별로 합쳐 호가창 배열을 만든다 */
function foldHuman(orders: Order[]): {
  bids: { price: number; qty: number }[];
  asks: { price: number; qty: number }[];
} {
  const b = new Map<number, number>();
  const a = new Map<number, number>();
  for (const o of orders) {
    if (o.status !== "open") continue;
    const left = o.qty - o.filledQty;
    if (left <= 0) continue;
    const m = o.side === "buy" ? b : a;
    m.set(o.price, (m.get(o.price) ?? 0) + left);
  }
  const toArr = (m: Map<number, number>, desc: boolean) =>
    [...m.entries()]
      .map(([price, qty]) => ({ price, qty }))
      .sort((x, y) => (desc ? y.price - x.price : x.price - y.price))
      .slice(0, RULES.BOOK_DEPTH * 3);
  return { bids: toArr(b, true), asks: toArr(a, false) };
}

function pushCandle(book: BookState, price: number, qty: number, now: number) {
  const bucket = Math.floor(now / CANDLE_MS) * CANDLE_MS;
  const arr = (book as BookState & { candles?: Candle[] }).candles ?? [];
  const last = arr[arr.length - 1];
  if (last && last.t === bucket) {
    last.h = Math.max(last.h, price);
    last.l = Math.min(last.l, price);
    last.c = price;
    last.v += qty;
  } else {
    arr.push({ t: bucket, o: price, h: price, l: price, c: price, v: qty });
    while (arr.length > CANDLE_KEEP) arr.shift();
  }
  (book as BookState & { candles?: Candle[] }).candles = arr;
}

/** 지금 값을 매길 기준가. 사람 거래가 있으면 마지막 체결가, 없으면 마켓메이커 기준가 */
export function referencePrice(asset: Asset, book: BookState, now: number): number {
  const inv = decayInventory(book.mmInventory, book.mmUpdatedAt, now);
  const mid = mmMid(asset, now, inv);
  if (!book.last) return mid;
  // 마지막 체결이 오래됐으면 마켓메이커 기준가로 돌아온다
  const ageMin = (now - book.updatedAt) / 60_000;
  if (ageMin > 30) return mid;
  const w = Math.min(1, ageMin / 30);
  return book.last * (1 - w) + mid * w;
}

export async function processOrder(
  ctx: Ctx,
  asset: Asset,
  input: OrderInput
): Promise<SubmitResult> {
  const now = ctx.now;
  const book = ctx.book;

  const qty = Math.floor(input.qty);
  if (!Number.isFinite(qty) || qty <= 0) throw new OrderError("수량은 1주 이상이어야 합니다.");
  if (qty > RULES.MAX_QTY)
    throw new OrderError(`한 번에 ${RULES.MAX_QTY.toLocaleString()}주까지만 낼 수 있습니다.`);

  const account = await ctx.getAccount(input.uid);
  if (!account) throw new OrderError("계정을 먼저 만들어 주세요.");

  book.mmInventory = decayInventory(book.mmInventory, book.mmUpdatedAt, now);
  book.mmUpdatedAt = now;

  const ref = referencePrice(asset, book, now);

  let limitPrice: number | null = null;
  if (input.type === "limit") {
    const p = roundToTick(input.price);
    if (!Number.isFinite(p) || p <= 0) throw new OrderError("주문 가격을 확인해 주세요.");
    if (p % tickSize(p) !== 0) throw new OrderError("호가 단위에 맞지 않습니다.");
    const lo = ref * (1 - RULES.PRICE_BAND);
    const hi = ref * (1 + RULES.PRICE_BAND);
    if (p < lo || p > hi)
      throw new OrderError(
        `현재가에서 ${Math.round(RULES.PRICE_BAND * 100)}% 넘게 벗어난 값은 못 냅니다.`
      );
    limitPrice = p;
  }

  const holding = await ctx.getHolding(input.uid, asset.symbol);

  // 매도는 가진 주식 안에서만
  if (input.side === "sell") {
    const avail = holding.qty - holding.locked;
    if (qty > avail)
      throw new OrderError(
        `팔 수 있는 수량은 ${avail.toLocaleString()}주입니다.`
      );
  }

  const myOpen = (await ctx.getRestingOrders(asset.symbol, input.side)).filter(
    (o) => o.uid === input.uid
  );
  if (myOpen.length >= RULES.MAX_OPEN_ORDERS)
    throw new OrderError(`미체결 주문은 종목당 ${RULES.MAX_OPEN_ORDERS}건까지입니다.`);

  const resting = await ctx.getRestingOrders(
    asset.symbol,
    input.side === "buy" ? "sell" : "buy"
  );
  // 자기 주문끼리는 체결하지 않는다
  const counter = resting.filter((o) => o.uid !== input.uid);

  const units = buildUnits(input.side, asset, now, book.mmInventory, counter);

  let cashCap: number | null = null;
  if (input.side === "buy") {
    cashCap = input.type === "market" ? account.cash : Math.min(account.cash, Infinity);
    if (input.type === "limit") {
      const need = limitPrice! * qty;
      if (need + feeOf(need) > account.cash)
        throw new OrderError("예수금이 모자랍니다.");
      cashCap = null;
    }
  }

  const outcome = match(units, input.side, qty, limitPrice, cashCap);

  if (outcome.filledQty === 0 && input.type === "market") {
    const cheapest = units[0]?.price ?? 0;
    if (input.side === "buy" && cheapest > 0 && account.cash < cheapest)
      throw new OrderError("예수금이 모자랍니다.");
    throw new OrderError("지금 체결할 물량이 없습니다.");
  }

  const orderId = ctx.newId();
  const order: Order & { reserved?: number } = {
    id: orderId,
    uid: input.uid,
    nick: input.nick,
    symbol: asset.symbol,
    side: input.side,
    type: input.type,
    price: limitPrice ?? 0,
    qty,
    filledQty: outcome.filledQty,
    filledAmount: outcome.filledAmount,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };

  let takerFee = 0;
  const trades: Trade[] = [];

  // ── 체결 반영 ────────────────────────────────────────────────────
  for (const f of outcome.fills) {
    const amount = f.price * f.qty;
    const fee = feeOf(amount);
    takerFee += fee;

    if (input.side === "buy") {
      account.cash -= amount + fee;
      const cost = holding.avgPrice * holding.qty + amount + fee;
      holding.qty += f.qty;
      holding.avgPrice = holding.qty > 0 ? cost / holding.qty : 0;
    } else {
      account.cash += amount - fee;
      const remainQty = holding.qty - f.qty;
      holding.qty = remainQty;
      if (remainQty <= 0) {
        holding.qty = 0;
        holding.avgPrice = 0;
      }
    }

    ctx.putFill({
      id: ctx.newId(),
      uid: input.uid,
      symbol: asset.symbol,
      side: input.side,
      price: f.price,
      qty: f.qty,
      amount,
      fee,
      taker: true,
      ts: now,
    });

    // 상대가 사람이면 그쪽도 정산한다
    if (f.orderId && f.uid) {
      const co = (await ctx.getOrder(f.orderId)) as (Order & { reserved?: number }) | null;
      if (co) {
        co.filledQty += f.qty;
        co.filledAmount += amount;
        co.updatedAt = now;
        if (co.filledQty >= co.qty) co.status = "filled";
        const cFee = feeOf(amount);
        if (co.side === "buy") {
          const used = amount + cFee;
          co.reserved = Math.max(0, (co.reserved ?? used) - used);
          const ca = await ctx.getAccount(f.uid);
          const ch = await ctx.getHolding(f.uid, asset.symbol);
          if (ca && ch) {
            const cost = ch.avgPrice * ch.qty + amount + cFee;
            ch.qty += f.qty;
            ch.avgPrice = ch.qty > 0 ? cost / ch.qty : 0;
            ctx.putHolding(f.uid, ch);
            ca.updatedAt = now;
            ctx.putAccount(ca);
          }
        } else {
          const ca = await ctx.getAccount(f.uid);
          const ch = await ctx.getHolding(f.uid, asset.symbol);
          if (ca && ch) {
            ca.cash += amount - cFee;
            ca.updatedAt = now;
            ch.locked = Math.max(0, ch.locked - f.qty);
            ch.qty = Math.max(0, ch.qty - f.qty);
            if (ch.qty === 0) ch.avgPrice = 0;
            ctx.putAccount(ca);
            ctx.putHolding(f.uid, ch);
          }
        }
        if (co.status === "filled") {
          // 남은 예약금 돌려준다
          if (co.side === "buy" && (co.reserved ?? 0) > 0) {
            const ca = await ctx.getAccount(co.uid);
            if (ca) {
              ca.cash += co.reserved!;
              co.reserved = 0;
              ctx.putAccount(ca);
            }
          }
        }
        ctx.putOrder(co);

        ctx.putFill({
          id: ctx.newId(),
          uid: f.uid,
          symbol: asset.symbol,
          side: co.side,
          price: f.price,
          qty: f.qty,
          amount,
          fee: cFee,
          taker: false,
          ts: now,
        });
      }
    }

    trades.push({
      id: ctx.newId(),
      symbol: asset.symbol,
      price: f.price,
      qty: f.qty,
      taker: input.side,
      ts: now,
      mm: f.mm,
    });
    pushCandle(book, f.price, f.qty, now);
  }

  book.mmInventory += outcome.mmDelta;

  // ── 남은 수량 처리 ──────────────────────────────────────────────
  if (outcome.remainingQty > 0) {
    if (input.type === "market") {
      order.status = outcome.filledQty > 0 ? "filled" : "cancelled";
    } else {
      order.status = "open";
      const left = outcome.remainingQty;
      if (input.side === "buy") {
        const need = limitPrice! * left;
        const reserve = need + feeOf(need);
        if (reserve > account.cash) throw new OrderError("예수금이 모자랍니다.");
        account.cash -= reserve;
        order.reserved = reserve;
      } else {
        holding.locked += left;
      }
    }
  } else {
    order.status = "filled";
  }

  account.updatedAt = now;
  ctx.putAccount(account);
  ctx.putHolding(input.uid, holding);
  ctx.putOrder(order);

  // ── 호가창·시세 갱신 ────────────────────────────────────────────
  const allResting = [
    ...(await ctx.getRestingOrders(asset.symbol, "buy")),
    ...(await ctx.getRestingOrders(asset.symbol, "sell")),
  ].filter((o) => o.id !== order.id);
  if (order.status === "open") allResting.push(order);
  const folded = foldHuman(allResting);
  book.humanBids = folded.bids;
  book.humanAsks = folded.asks;

  if (trades.length) {
    const today = ymd(now);
    if (book.volumeYmd !== today) {
      book.prevClose = book.last || ref;
      book.prevCloseYmd = book.volumeYmd;
      book.volume = 0;
      book.volumeYmd = today;
    }
    book.last = trades[trades.length - 1].price;
    book.volume += outcome.filledQty;
    book.recentTrades = [...trades.reverse(), ...book.recentTrades].slice(
      0,
      RULES.RECENT_TRADES
    );
  }
  book.updatedAt = now;

  const avg = outcome.filledQty > 0 ? outcome.filledAmount / outcome.filledQty : 0;
  const msg =
    outcome.filledQty === 0
      ? "주문을 걸어 두었습니다."
      : outcome.remainingQty > 0 && order.status === "open"
        ? `${outcome.filledQty.toLocaleString()}주 체결, 나머지는 걸어 두었습니다.`
        : `${outcome.filledQty.toLocaleString()}주 체결했습니다.`;

  return {
    order,
    fills: outcome.fills.map((f) => ({ price: f.price, qty: f.qty })),
    filledQty: outcome.filledQty,
    avgPrice: avg,
    fee: takerFee,
    message: msg,
  };
}

/** 주문 취소. 예약금과 잠긴 주식을 돌려준다 */
export async function processCancel(
  ctx: Ctx,
  order: Order & { reserved?: number }
): Promise<void> {
  const left = order.qty - order.filledQty;
  order.status = "cancelled";
  order.updatedAt = ctx.now;
  if (left > 0) {
    if (order.side === "buy") {
      const refund = order.reserved ?? 0;
      if (refund > 0) {
        const acc = await ctx.getAccount(order.uid);
        if (acc) {
          acc.cash += refund;
          acc.updatedAt = ctx.now;
          ctx.putAccount(acc);
        }
      }
      order.reserved = 0;
    } else {
      const h = await ctx.getHolding(order.uid, order.symbol);
      h.locked = Math.max(0, h.locked - left);
      ctx.putHolding(order.uid, h);
    }
  }
  ctx.putOrder(order);

  const rest = [
    ...(await ctx.getRestingOrders(order.symbol, "buy")),
    ...(await ctx.getRestingOrders(order.symbol, "sell")),
  ].filter((o) => o.id !== order.id);
  const folded = foldHuman(rest);
  ctx.book.humanBids = folded.bids;
  ctx.book.humanAsks = folded.asks;
  ctx.book.updatedAt = ctx.now;
}

export { buildBookLevels, foldHuman };
