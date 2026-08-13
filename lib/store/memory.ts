import { RULES } from "../config";
import { getAsset, getAssets, msToYm } from "../market";
import { decayInventory } from "../pricing";
import {
  emptyHolding,
  OrderError,
  processCancel,
  processOrder,
  referencePrice,
  type Ctx,
} from "../order-core";
import type { Account, Candle, Order, RankRow, Side } from "../types";
import {
  emptyBook,
  type BookState,
  type FillRecord,
  type HoldingRow,
  type OrderInput,
  type Store,
  type SubmitResult,
} from "./types";

/**
 * 서버 메모리 저장소.
 * Firebase 자격증명이 없을 때 쓴다. 프로세스가 내려가면 다 날아가므로
 * 만들어 보고 눌러 보는 용도다. 진짜 시장은 Firestore 로 돌린다.
 */

interface Mem {
  accounts: Map<string, Account>;
  holdings: Map<string, HoldingRow>;
  orders: Map<string, Order & { reserved?: number }>;
  books: Map<string, BookState & { candles?: Candle[] }>;
  fills: FillRecord[];
  equity: Map<string, RankRow>;
  seq: number;
}

const g = globalThis as unknown as { __zipgapMem?: Mem };

function mem(): Mem {
  if (!g.__zipgapMem) {
    g.__zipgapMem = {
      accounts: new Map(),
      holdings: new Map(),
      orders: new Map(),
      books: new Map(),
      fills: [],
      equity: new Map(),
      seq: 0,
    };
  }
  return g.__zipgapMem;
}

const hkey = (uid: string, symbol: string) => `${uid}::${symbol}`;

function bookOf(symbol: string, now: number): BookState & { candles?: Candle[] } {
  const m = mem();
  let b = m.books.get(symbol);
  if (!b) {
    b = emptyBook(symbol, now);
    m.books.set(symbol, b);
  }
  return b;
}

function nextId(): string {
  const m = mem();
  m.seq += 1;
  return `m${m.seq.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function makeCtx(symbol: string, now: number): { ctx: Ctx; flush: () => void } {
  const m = mem();
  // 원본을 그대로 넘기면 주문이 중간에 막혔을 때도 호가 문서가 바뀐다.
  // 사본에 쓰고 성공했을 때만 되돌려 넣는다.
  const book = structuredClone(bookOf(symbol, now));
  const pendingAcc = new Map<string, Account>();
  const pendingHold = new Map<string, HoldingRow>();
  const pendingOrd = new Map<string, Order & { reserved?: number }>();
  const pendingFills: FillRecord[] = [];

  // 저장된 객체를 바로 넘기면 주문이 중간에 막혔을 때도 잔고가 바뀐다.
  // 사본을 만들어 쓰고, 같은 것을 다시 달라고 하면 그 사본을 준다.
  const workAcc = new Map<string, Account | null>();
  const workHold = new Map<string, HoldingRow>();
  const workOrd = new Map<string, Order & { reserved?: number }>();

  const ctx: Ctx = {
    now,
    book,
    async getAccount(uid) {
      if (pendingAcc.has(uid)) return pendingAcc.get(uid)!;
      if (!workAcc.has(uid)) {
        const src = m.accounts.get(uid);
        workAcc.set(uid, src ? { ...src } : null);
      }
      return workAcc.get(uid)!;
    },
    async getHolding(uid, sym) {
      const k = hkey(uid, sym);
      if (pendingHold.has(k)) return pendingHold.get(k)!;
      if (!workHold.has(k)) {
        const src = m.holdings.get(k);
        workHold.set(k, src ? { ...src } : emptyHolding(sym));
      }
      return workHold.get(k)!;
    },
    async getRestingOrders(sym, side) {
      const merged = new Map<string, Order & { reserved?: number }>();
      for (const o of m.orders.values()) {
        if (!workOrd.has(o.id)) workOrd.set(o.id, { ...o });
        merged.set(o.id, workOrd.get(o.id)!);
      }
      for (const o of pendingOrd.values()) merged.set(o.id, o);
      const out = [...merged.values()].filter(
        (o) => o.symbol === sym && o.side === side && o.status === "open"
      );
      out.sort((a, b) =>
        side === "buy"
          ? b.price - a.price || a.createdAt - b.createdAt
          : a.price - b.price || a.createdAt - b.createdAt
      );
      return out;
    },
    async getOrder(id) {
      if (pendingOrd.has(id)) return pendingOrd.get(id)!;
      if (!workOrd.has(id)) {
        const src = m.orders.get(id);
        if (!src) return null;
        workOrd.set(id, { ...src });
      }
      return workOrd.get(id) ?? null;
    },
    putAccount(a) {
      pendingAcc.set(a.uid, a);
    },
    putHolding(uid, h) {
      pendingHold.set(hkey(uid, h.symbol), h);
    },
    putOrder(o) {
      pendingOrd.set(o.id, o);
    },
    putFill(rec) {
      pendingFills.push(rec);
    },
    newId: nextId,
  };

  const flush = () => {
    for (const [k, v] of pendingAcc) m.accounts.set(k, { ...v });
    for (const [k, v] of pendingHold) m.holdings.set(k, { ...v });
    for (const [k, v] of pendingOrd) m.orders.set(k, { ...v });
    m.fills.push(...pendingFills);
    if (m.fills.length > 5000) m.fills.splice(0, m.fills.length - 5000);
    m.books.set(symbol, book);
  };

  return { ctx, flush };
}

export const memoryStore: Store = {
  kind: "memory",

  async ensureAccount(uid, nick, anon) {
    const m = mem();
    const now = Date.now();
    let acc = m.accounts.get(uid);
    if (!acc) {
      acc = {
        uid,
        nick,
        cash: RULES.SEED_CASH,
        seed: RULES.SEED_CASH,
        dividend: 0,
        lastSettledYm: msToYm(now),
        createdAt: now,
        updatedAt: now,
        anon,
      };
      m.accounts.set(uid, acc);
    }
    return acc;
  },

  async getAccount(uid) {
    return mem().accounts.get(uid) ?? null;
  },

  async updateNick(uid, nick) {
    const m = mem();
    const acc = m.accounts.get(uid);
    if (!acc) throw new OrderError("계정이 없습니다.");
    acc.nick = nick;
    acc.updatedAt = Date.now();
    const rank = m.equity.get(uid);
    if (rank) rank.nick = nick;
    return acc;
  },

  async getHoldings(uid) {
    const out: HoldingRow[] = [];
    for (const [k, v] of mem().holdings) {
      if (k.startsWith(uid + "::") && v.qty > 0) out.push(v);
    }
    return out;
  },

  async getBook(symbol) {
    return bookOf(symbol, Date.now());
  },

  async getAllBooks() {
    const now = Date.now();
    const out: Record<string, BookState> = {};
    for (const a of getAssets()) out[a.symbol] = bookOf(a.symbol, now);
    return out;
  },

  async getMyOrders(uid, symbol) {
    const out: Order[] = [];
    for (const o of mem().orders.values()) {
      if (o.uid !== uid) continue;
      if (symbol && o.symbol !== symbol) continue;
      out.push(o);
    }
    out.sort((a, b) => b.createdAt - a.createdAt);
    return out.slice(0, 100);
  },

  async getMyFills(uid, limit) {
    return mem()
      .fills.filter((f) => f.uid === uid)
      .sort((a, b) => b.ts - a.ts)
      .slice(0, limit);
  },

  async submitOrder(input: OrderInput): Promise<SubmitResult> {
    const asset = getAsset(input.symbol);
    if (!asset) throw new OrderError("없는 종목입니다.");
    const { ctx, flush } = makeCtx(asset.symbol, Date.now());
    const res = await processOrder(ctx, asset, input);
    flush();
    return res;
  },

  async cancelOrder(uid, orderId) {
    const m = mem();
    const o = m.orders.get(orderId);
    if (!o) throw new OrderError("주문을 찾을 수 없습니다.");
    if (o.uid !== uid) throw new OrderError("내 주문이 아닙니다.");
    if (o.status !== "open") throw new OrderError("이미 끝난 주문입니다.");
    const { ctx, flush } = makeCtx(o.symbol, Date.now());
    await processCancel(ctx, { ...o });
    flush();
  },

  async getCandles(symbol) {
    const b = bookOf(symbol, Date.now());
    return b.candles ?? [];
  },

  async leaderboard(limit) {
    return [...mem().equity.values()]
      .sort((a, b) => b.pnlRate - a.pnlRate)
      .slice(0, limit);
  },

  async recordEquity(uid, nick, equity, seed) {
    mem().equity.set(uid, {
      uid,
      nick,
      equity,
      pnl: equity - seed,
      pnlRate: seed > 0 ? (equity - seed) / seed : 0,
      updatedAt: Date.now(),
    });
  },

  async settleDividend(uid) {
    const m = mem();
    const acc = m.accounts.get(uid);
    if (!acc) return 0;
    const now = Date.now();
    const paid = computeDividend(acc, await this.getHoldings(uid), now);
    if (paid.amount > 0) {
      acc.cash += paid.amount;
      acc.dividend += paid.amount;
    }
    acc.lastSettledYm = paid.ym;
    acc.updatedAt = now;
    return paid.amount;
  },
};

/** 보유한 만큼 월세를 준다. 지난 달 수만큼 몰아서 계산한다 */
export function computeDividend(
  acc: Account,
  holdings: HoldingRow[],
  now: number
): { amount: number; ym: string } {
  const nowYm = msToYm(now);
  const months = monthsBetween(acc.lastSettledYm, nowYm);
  if (months <= 0) return { amount: 0, ym: nowYm };
  const capped = Math.min(months, 12);
  let total = 0;
  for (const h of holdings) {
    const asset = getAsset(h.symbol);
    if (!asset || h.qty <= 0) continue;
    const book = bookOf(asset.symbol, now);
    const inv = decayInventory(book.mmInventory, book.mmUpdatedAt, now);
    const price = referencePrice(asset, { ...book, mmInventory: inv }, now);
    total += Math.floor((price * h.qty * asset.rentYield * capped) / 12);
  }
  return { amount: total, ym: nowYm };
}

export function monthsBetween(fromYm: string, toYm: string): number {
  if (!fromYm) return 0;
  const [fy, fm] = fromYm.split("-").map(Number);
  const [ty, tm] = toYm.split("-").map(Number);
  if (!fy || !ty) return 0;
  return (ty - fy) * 12 + (tm - fm);
}

export type { Side };
