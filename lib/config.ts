/** 거래소 규칙값. 여기 숫자만 고치면 시장 성격이 바뀐다. */
export const RULES = {
  /** 계정을 열 때 주는 예수금 (원) */
  SEED_CASH: 10_000_000,
  /** 거래 수수료율. 매수·매도 양쪽에 붙는다 */
  FEE_RATE: 0.0005,
  /** 한 주문에 넣을 수 있는 최대 수량 */
  MAX_QTY: 100_000,
  /** 지정가가 현재가에서 이만큼 넘게 벗어나면 거부한다 */
  PRICE_BAND: 0.3,
  /** 한 사람이 종목당 걸어둘 수 있는 미체결 주문 수 */
  MAX_OPEN_ORDERS: 20,
  /** 한 번의 매칭에서 상대할 수 있는 최대 주문 수 */
  MAX_MATCH_LEGS: 12,
  /** 호가창에 보여줄 단수 */
  BOOK_DEPTH: 10,
  /** 최근 체결 보관 수 */
  RECENT_TRADES: 30,
} as const;

export const MM = {
  /** 마켓메이커 스프레드 (mid 대비 한쪽) */
  SPREAD: 0.0015,
  /** 호가 사다리 단수 */
  LEVELS: 10,
  /** 1단 물량(주). 종목 주가에 반비례해 조정한다 */
  BASE_NOTIONAL: 12_000_000,
  /** 단이 멀어질수록 물량이 늘어나는 비율 */
  DEPTH_GROWTH: 0.35,
  /**
   * 재고 한도(명목금액, 원).
   * 이 값이 작을수록 사람 주문이 값을 세게 민다.
   * 시드머니 1,000만원이니 30명이 한 종목에 전부 넣으면 한도에 닿는다.
   */
  MAX_INVENTORY_NOTIONAL: 300_000_000,
  /** 재고가 한도까지 찼을 때 가격을 밀어올리는 폭 */
  SKEW: 0.15,
  /** 재고가 하루에 0 쪽으로 줄어드는 비율 */
  INVENTORY_DECAY_PER_DAY: 0.2,
} as const;

/** 호가 단위 */
export function tickSize(price: number): number {
  if (price < 2_000) return 1;
  if (price < 5_000) return 5;
  if (price < 20_000) return 10;
  if (price < 50_000) return 25;
  if (price < 200_000) return 50;
  return 100;
}

export function roundToTick(price: number, dir: "up" | "down" | "near" = "near"): number {
  const t = tickSize(price);
  if (dir === "up") return Math.ceil(price / t) * t;
  if (dir === "down") return Math.floor(price / t) * t;
  return Math.round(price / t) * t;
}
