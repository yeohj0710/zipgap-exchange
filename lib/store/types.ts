import type { Account, Candle, Order, OrderType, RankRow, Side, Trade } from "../types";

export interface HoldingRow {
  symbol: string;
  qty: number;
  /** 미체결 매도 주문에 묶인 수량 */
  locked: number;
  avgPrice: number;
}

export interface BookState {
  symbol: string;
  /** 마지막 체결가. 0 이면 아직 사람 거래가 없다 */
  last: number;
  prevClose: number;
  prevCloseYmd: string;
  volume: number;
  volumeYmd: string;
  /** 마켓메이커 재고 */
  mmInventory: number;
  mmUpdatedAt: number;
  /** 사람 미체결 주문을 값별로 합친 것 */
  humanBids: { price: number; qty: number }[];
  humanAsks: { price: number; qty: number }[];
  recentTrades: Trade[];
  updatedAt: number;
}

export interface FillRecord {
  id: string;
  uid: string;
  symbol: string;
  side: Side;
  price: number;
  qty: number;
  amount: number;
  fee: number;
  /** 주문을 낸 쪽이었는지 */
  taker: boolean;
  ts: number;
}

export interface OrderInput {
  uid: string;
  nick: string;
  symbol: string;
  side: Side;
  type: OrderType;
  price: number;
  qty: number;
}

export interface SubmitResult {
  order: Order;
  fills: { price: number; qty: number }[];
  filledQty: number;
  avgPrice: number;
  fee: number;
  message: string;
}

export interface Store {
  kind: "firestore" | "memory";
  ensureAccount(uid: string, nick: string, anon: boolean): Promise<Account>;
  getAccount(uid: string): Promise<Account | null>;
  updateNick(uid: string, nick: string): Promise<Account>;
  getHoldings(uid: string): Promise<HoldingRow[]>;
  getBook(symbol: string): Promise<BookState>;
  getAllBooks(): Promise<Record<string, BookState>>;
  getMyOrders(uid: string, symbol?: string): Promise<Order[]>;
  getMyFills(uid: string, limit: number): Promise<FillRecord[]>;
  submitOrder(input: OrderInput): Promise<SubmitResult>;
  cancelOrder(uid: string, orderId: string): Promise<void>;
  getCandles(symbol: string, fromMs?: number): Promise<Candle[]>;
  leaderboard(limit: number): Promise<RankRow[]>;
  recordEquity(uid: string, nick: string, equity: number, seed: number): Promise<void>;
  /** 밀린 월세 배당을 정산하고 지급액을 돌려준다 */
  settleDividend(uid: string): Promise<number>;
}

export function emptyBook(symbol: string, now: number): BookState {
  return {
    symbol,
    last: 0,
    prevClose: 0,
    prevCloseYmd: "",
    volume: 0,
    volumeYmd: "",
    mmInventory: 0,
    mmUpdatedAt: now,
    humanBids: [],
    humanAsks: [],
    recentTrades: [],
    updatedAt: now,
  };
}

export type { Order, Trade, Account, RankRow, Candle };
