import type { Firestore, Transaction } from "firebase-admin/firestore";
import { RULES } from "../config";
import { admin } from "../firebase-admin";
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
import type { Account, Candle, Order, RankRow } from "../types";
import {
  emptyBook,
  type BookState,
  type FillRecord,
  type HoldingRow,
  type OrderInput,
  type Store,
  type SubmitResult,
} from "./types";
import { monthsBetween } from "./memory";

/**
 * Firestore 저장소.
 *
 * 문서 구조
 *   accounts/{uid}                     예수금·닉네임
 *   accounts/{uid}/holdings/{symbol}    보유 종목
 *   accounts/{uid}/fills/{id}           내 체결 기록
 *   orders/{orderId}                    미체결·체결 주문
 *   books/{symbol}                      호가·시세·분봉. 브라우저가 이 문서 하나만 구독한다
 *   ranks/{uid}                         랭킹용 평가액 스냅샷
 *
 * 브라우저는 읽기만 한다. 쓰기는 전부 서버(Admin SDK)를 지난다.
 */

type OrderDoc = Order & { reserved?: number };
type BookDoc = BookState & { candles?: Candle[] };

function db(): Firestore {
  const a = admin();
  if (!a) throw new OrderError("서버에 데이터베이스가 연결돼 있지 않습니다.");
  return a.db;
}

const accRef = (d: Firestore, uid: string) => d.collection("accounts").doc(uid);
const holdRef = (d: Firestore, uid: string, symbol: string) =>
  accRef(d, uid).collection("holdings").doc(symbol);
const fillCol = (d: Firestore, uid: string) => accRef(d, uid).collection("fills");
const orderRef = (d: Firestore, id: string) => d.collection("orders").doc(id);
const bookRef = (d: Firestore, symbol: string) => d.collection("books").doc(symbol);
const rankRef = (d: Firestore, uid: string) => d.collection("ranks").doc(uid);

function newAccount(uid: string, nick: string, anon: boolean, now: number): Account {
  return {
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
}

/** 트랜잭션 안에서 쓰는 작업 단위. 읽기는 캐시하고 쓰기는 마지막에 몰아 넣는다 */
class TxCtx implements Ctx {
  now: number;
  book: BookDoc;
  private d: Firestore;
  private tx: Transaction;
  private symbol: string;
  private accCache = new Map<string, Account | null>();
  private holdCache = new Map<string, HoldingRow>();
  private orderCache = new Map<string, OrderDoc>();
  private openLoaded = false;
  private openOrders: OrderDoc[] = [];
  private wAcc = new Map<string, Account>();
  private wHold = new Map<string, HoldingRow>();
  private wOrder = new Map<string, OrderDoc>();
  private wFills: FillRecord[] = [];
  private idSeq = 0;

  constructor(d: Firestore, tx: Transaction, symbol: string, book: BookDoc, now: number) {
    this.d = d;
    this.tx = tx;
    this.symbol = symbol;
    this.book = book;
    this.now = now;
  }

  async loadOpen(): Promise<void> {
    if (this.openLoaded) return;
    const snap = await this.tx.get(
      this.d
        .collection("orders")
        .where("symbol", "==", this.symbol)
        .where("status", "==", "open")
        .limit(300)
    );
    this.openOrders = snap.docs.map((s) => s.data() as OrderDoc);
    for (const o of this.openOrders) this.orderCache.set(o.id, o);
    this.openLoaded = true;
  }

  async getAccount(uid: string): Promise<Account | null> {
    if (this.wAcc.has(uid)) return this.wAcc.get(uid)!;
    if (this.accCache.has(uid)) return this.accCache.get(uid)!;
    const s = await this.tx.get(accRef(this.d, uid));
    const v = s.exists ? (s.data() as Account) : null;
    this.accCache.set(uid, v);
    return v;
  }

  async getHolding(uid: string, symbol: string): Promise<HoldingRow> {
    const k = `${uid}::${symbol}`;
    if (this.wHold.has(k)) return this.wHold.get(k)!;
    if (this.holdCache.has(k)) return this.holdCache.get(k)!;
    const s = await this.tx.get(holdRef(this.d, uid, symbol));
    const v = s.exists ? (s.data() as HoldingRow) : emptyHolding(symbol);
    this.holdCache.set(k, v);
    return v;
  }

  async getRestingOrders(symbol: string, side: "buy" | "sell"): Promise<Order[]> {
    await this.loadOpen();
    const merged = new Map<string, OrderDoc>();
    for (const o of this.openOrders) merged.set(o.id, o);
    for (const [id, o] of this.wOrder) merged.set(id, o);
    const out = [...merged.values()].filter(
      (o) => o.symbol === symbol && o.side === side && o.status === "open"
    );
    out.sort((a, b) =>
      side === "buy"
        ? b.price - a.price || a.createdAt - b.createdAt
        : a.price - b.price || a.createdAt - b.createdAt
    );
    return out;
  }

  async getOrder(id: string): Promise<Order | null> {
    if (this.wOrder.has(id)) return this.wOrder.get(id)!;
    await this.loadOpen();
    if (this.orderCache.has(id)) return this.orderCache.get(id)!;
    const s = await this.tx.get(orderRef(this.d, id));
    if (!s.exists) return null;
    const v = s.data() as OrderDoc;
    this.orderCache.set(id, v);
    return v;
  }

  putAccount(a: Account) {
    this.wAcc.set(a.uid, a);
  }
  putHolding(uid: string, h: HoldingRow) {
    this.wHold.set(`${uid}::${h.symbol}`, h);
  }
  putOrder(o: Order) {
    this.wOrder.set(o.id, o as OrderDoc);
  }
  putFill(rec: FillRecord) {
    this.wFills.push(rec);
  }
  newId(): string {
    this.idSeq += 1;
    return `${this.now.toString(36)}${this.idSeq.toString(36)}${Math.floor(
      Math.random() * 1e8
    ).toString(36)}`;
  }

  flush() {
    for (const [uid, a] of this.wAcc) this.tx.set(accRef(this.d, uid), a, { merge: true });
    for (const [k, h] of this.wHold) {
      const [uid] = k.split("::");
      this.tx.set(holdRef(this.d, uid, h.symbol), h, { merge: true });
    }
    for (const [id, o] of this.wOrder) this.tx.set(orderRef(this.d, id), o);
    for (const f of this.wFills) this.tx.set(fillCol(this.d, f.uid).doc(f.id), f);
    this.tx.set(bookRef(this.d, this.symbol), this.book, { merge: true });
  }
}

async function readBook(
  d: Firestore,
  tx: Transaction,
  symbol: string,
  now: number
): Promise<BookDoc> {
  const s = await tx.get(bookRef(d, symbol));
  if (!s.exists) return emptyBook(symbol, now) as BookDoc;
  const raw = s.data() as BookDoc;
  return { ...emptyBook(symbol, now), ...raw };
}

export const firestoreStore: Store = {
  kind: "firestore",

  async ensureAccount(uid, nick, anon) {
    const d = db();
    const now = Date.now();
    const ref = accRef(d, uid);
    return d.runTransaction(async (tx) => {
      const s = await tx.get(ref);
      if (s.exists) {
        const acc = s.data() as Account;
        return acc;
      }
      const acc = newAccount(uid, nick, anon, now);
      tx.set(ref, acc);
      return acc;
    });
  },

  async getAccount(uid) {
    const s = await accRef(db(), uid).get();
    return s.exists ? (s.data() as Account) : null;
  },

  async updateNick(uid, nick) {
    const d = db();
    const now = Date.now();
    await accRef(d, uid).set({ nick, updatedAt: now }, { merge: true });
    await rankRef(d, uid).set({ nick }, { merge: true }).catch(() => {});
    const s = await accRef(d, uid).get();
    return s.data() as Account;
  },

  async getHoldings(uid) {
    const snap = await accRef(db(), uid).collection("holdings").get();
    return snap.docs.map((s) => s.data() as HoldingRow).filter((h) => h.qty > 0);
  },

  async getBook(symbol) {
    const s = await bookRef(db(), symbol).get();
    const now = Date.now();
    if (!s.exists) return emptyBook(symbol, now);
    return { ...emptyBook(symbol, now), ...(s.data() as BookState) };
  },

  async getAllBooks() {
    const snap = await db().collection("books").get();
    const now = Date.now();
    const out: Record<string, BookState> = {};
    for (const a of getAssets()) out[a.symbol] = emptyBook(a.symbol, now);
    for (const doc of snap.docs) {
      out[doc.id] = { ...emptyBook(doc.id, now), ...(doc.data() as BookState) };
    }
    return out;
  },

  async getMyOrders(uid, symbol) {
    let q = db().collection("orders").where("uid", "==", uid);
    if (symbol) q = q.where("symbol", "==", symbol);
    const snap = await q.orderBy("createdAt", "desc").limit(100).get();
    return snap.docs.map((s) => s.data() as Order);
  },

  async getMyFills(uid, limit) {
    const snap = await fillCol(db(), uid).orderBy("ts", "desc").limit(limit).get();
    return snap.docs.map((s) => s.data() as FillRecord);
  },

  async submitOrder(input: OrderInput): Promise<SubmitResult> {
    const asset = getAsset(input.symbol);
    if (!asset) throw new OrderError("없는 종목입니다.");
    const d = db();
    return d.runTransaction(
      async (tx) => {
        const now = Date.now();
        const book = await readBook(d, tx, asset.symbol, now);
        const ctx = new TxCtx(d, tx, asset.symbol, book, now);
        const res = await processOrder(ctx, asset, input);
        ctx.flush();
        return res;
      },
      { maxAttempts: 5 }
    );
  },

  async cancelOrder(uid, orderId) {
    const d = db();
    await d.runTransaction(
      async (tx) => {
        const now = Date.now();
        const os = await tx.get(orderRef(d, orderId));
        if (!os.exists) throw new OrderError("주문을 찾을 수 없습니다.");
        const order = os.data() as OrderDoc;
        if (order.uid !== uid) throw new OrderError("내 주문이 아닙니다.");
        if (order.status !== "open") throw new OrderError("이미 끝난 주문입니다.");
        const book = await readBook(d, tx, order.symbol, now);
        const ctx = new TxCtx(d, tx, order.symbol, book, now);
        await processCancel(ctx, order);
        ctx.flush();
      },
      { maxAttempts: 5 }
    );
  },

  async getCandles(symbol) {
    const s = await bookRef(db(), symbol).get();
    if (!s.exists) return [];
    return ((s.data() as BookDoc).candles ?? []) as Candle[];
  },

  async leaderboard(limit) {
    const snap = await db()
      .collection("ranks")
      .orderBy("pnlRate", "desc")
      .limit(limit)
      .get();
    return snap.docs.map((s) => s.data() as RankRow);
  },

  async recordEquity(uid, nick, equity, seed) {
    const row: RankRow = {
      uid,
      nick,
      equity: Math.round(equity),
      pnl: Math.round(equity - seed),
      pnlRate: seed > 0 ? (equity - seed) / seed : 0,
      updatedAt: Date.now(),
    };
    await rankRef(db(), uid).set(row, { merge: true });
  },

  async settleDividend(uid) {
    const d = db();
    const now = Date.now();
    const nowYm = msToYm(now);

    const accSnap = await accRef(d, uid).get();
    if (!accSnap.exists) return 0;
    const acc = accSnap.data() as Account;
    const months = monthsBetween(acc.lastSettledYm, nowYm);
    if (months <= 0) return 0;

    const holdings = await this.getHoldings(uid);
    const capped = Math.min(months, 12);
    let total = 0;
    for (const h of holdings) {
      const asset = getAsset(h.symbol);
      if (!asset || h.qty <= 0) continue;
      const book = await this.getBook(asset.symbol);
      const inv = decayInventory(book.mmInventory, book.mmUpdatedAt, now);
      const price = referencePrice(asset, { ...book, mmInventory: inv }, now);
      total += Math.floor((price * h.qty * asset.rentYield * capped) / 12);
    }

    await d.runTransaction(async (tx) => {
      const s = await tx.get(accRef(d, uid));
      if (!s.exists) return;
      const cur = s.data() as Account;
      if (monthsBetween(cur.lastSettledYm, nowYm) <= 0) return;
      tx.set(
        accRef(d, uid),
        {
          cash: cur.cash + total,
          dividend: (cur.dividend ?? 0) + total,
          lastSettledYm: nowYm,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    return total;
  },
};
