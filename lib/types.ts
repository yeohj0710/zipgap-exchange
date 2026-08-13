// 집값거래소 공용 타입.
// 금액 단위 규칙:
//  - listings.json 의 price 는 "만원" (270000 = 27억)
//  - 화면과 거래에 쓰는 주가는 "원"
//  - 1주 = 실물 한 채의 SHARE_DIVISOR 분의 1 (기본 10만분의 1)

export type AssetKind = "index" | "complex";

export interface PricePoint {
  /** YYYY-MM */
  ym: string;
  /** 대표 거래가, 만원 단위 */
  price: number;
  /** 그 달의 거래 건수. 실거래 연동 전에는 추정치 */
  trades?: number;
  /** 값의 출처. real = 실거래 원자료, seed = 시드 추정치 */
  source?: "real" | "seed";
}

export interface Asset {
  /** 티커. 대문자 영문/숫자 */
  symbol: string;
  /** 화면에 쓰는 이름 */
  name: string;
  /** 짧은 별칭. 검색과 목록에 씀 */
  alias?: string;
  kind: AssetKind;
  /** 시도 단위 구분. 필터에 씀 */
  sido: string;
  /** 상세 위치 또는 지수 설명 */
  region: string;
  /** 대표 전용면적 m2. 지수형은 없음 */
  unitArea?: number;
  households?: number;
  builtYear?: number;
  tags: string[];
  /** 연 임대수익률. 월세 배당 계산에 씀 */
  rentYield: number;
  /** 1주가 실물의 몇 분의 1인지 */
  shareDivisor: number;
  /** 월별 시세. ym 오름차순 */
  history: PricePoint[];
}

export interface Listings {
  /** 데이터 갱신일 YYYY-MM-DD */
  version: string;
  /** 전체 데이터의 출처 상태 */
  status: "seed-estimate" | "partial-real" | "real";
  note: string;
  assets: Asset[];
}

export type Side = "buy" | "sell";
export type OrderType = "limit" | "market";
export type OrderStatus = "open" | "filled" | "cancelled";

export interface Order {
  id: string;
  uid: string;
  nick: string;
  symbol: string;
  side: Side;
  type: OrderType;
  /** 지정가. 시장가 주문은 0 */
  price: number;
  qty: number;
  filledQty: number;
  /** 체결된 금액 합계. 평균단가 계산에 씀 */
  filledAmount: number;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
}

export interface Trade {
  id: string;
  symbol: string;
  price: number;
  qty: number;
  /** 체결을 유발한 쪽 */
  taker: Side;
  ts: number;
  /** 상대가 마켓메이커였는지 */
  mm: boolean;
}

export interface BookLevel {
  price: number;
  qty: number;
  /** 이 호가에 마켓메이커 물량이 섞여 있는지 */
  mm?: boolean;
}

export interface BookSnapshot {
  symbol: string;
  bids: BookLevel[];
  asks: BookLevel[];
  /** 마지막 체결가 */
  last: number;
  /** 전일 종가 */
  prevClose: number;
  /** 오늘 거래량(주) */
  volume: number;
  /** 마켓메이커 재고. 양수면 MM 이 사들인 상태 */
  mmInventory: number;
  recentTrades: Trade[];
  updatedAt: number;
}

export interface Holding {
  symbol: string;
  qty: number;
  /** 평균 매입단가, 원 */
  avgPrice: number;
}

export interface Account {
  uid: string;
  nick: string;
  /** 예수금, 원 */
  cash: number;
  /** 지금까지 넣은 시드머니 합계 */
  seed: number;
  /** 누적 수령 월세 배당 */
  dividend: number;
  /** 마지막 배당 정산 기준월 YYYY-MM */
  lastSettledYm: string;
  createdAt: number;
  updatedAt: number;
  /** 익명 계정인지 */
  anon: boolean;
}

export interface Candle {
  /** 구간 시작 시각 ms */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface RankRow {
  uid: string;
  nick: string;
  equity: number;
  pnl: number;
  pnlRate: number;
  updatedAt: number;
}

export interface PortfolioRow extends Holding {
  asset: Asset;
  price: number;
  value: number;
  pnl: number;
  pnlRate: number;
}
