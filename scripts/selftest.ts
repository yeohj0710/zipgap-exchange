/**
 * 거래소가 실제로 도는지 확인한다.
 * 사람 둘이 서로 사고팔 때 잔고·보유·호가가 맞아떨어지는지 본다.
 *
 *   npm run selftest
 */
import { RULES } from "../lib/config";
import { getAsset } from "../lib/market";
import { quoteOf } from "../lib/quote";
import { memoryStore as S } from "../lib/store/memory";
import { roundToTick } from "../lib/config";

let failed = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  통과  ${label}`);
  } else {
    failed++;
    console.log(`  실패  ${label}${detail ? "  — " + detail : ""}`);
  }
}
function near(a: number, b: number, tol = 1) {
  return Math.abs(a - b) <= tol;
}

async function main() {
  const asset = getAsset("EUNMA")!;
  const sym = asset.symbol;

  console.log(`\n[1] 계정 개설`);
  const A = await S.ensureAccount("uA", "가", true);
  const B = await S.ensureAccount("uB", "나", true);
  check("시드머니 지급", A.cash === RULES.SEED_CASH, `${A.cash}`);

  console.log(`\n[2] 마켓메이커 상대로 시장가 매수`);
  const q0 = quoteOf(asset, await S.getBook(sym), Date.now());
  const r1 = await S.submitOrder({
    uid: "uA", nick: "가", symbol: sym, side: "buy", type: "market", price: 0, qty: 100,
  });
  check("100주 체결", r1.filledQty === 100, `${r1.filledQty}주`);
  const accA1 = (await S.getAccount("uA"))!;
  const holdA1 = (await S.getHoldings("uA"))[0];
  const spent = RULES.SEED_CASH - accA1.cash;
  check("보유 100주", holdA1?.qty === 100, `${holdA1?.qty}`);
  check(
    "예수금 차감 = 체결금액 + 수수료",
    near(spent, r1.avgPrice * 100 + r1.fee, 2),
    `차감 ${Math.round(spent)} vs 계산 ${Math.round(r1.avgPrice * 100 + r1.fee)}`
  );
  check("평단가에 수수료 포함", holdA1.avgPrice > r1.avgPrice, `${Math.round(holdA1.avgPrice)}`);
  console.log(`      기준가 ${Math.round(q0.price).toLocaleString()}원 / 평균체결 ${Math.round(r1.avgPrice).toLocaleString()}원`);

  console.log(`\n[3] 지정가 매도를 걸고, 다른 사람이 받아 간다`);
  // 마켓메이커 매도호가보다 싸게 내야 사람 주문이 먼저 나간다.
  // 스프레드 안쪽(기준가 언저리)에 걸면 양쪽 모두에 걸치지 않는다.
  const mid = quoteOf(asset, await S.getBook(sym), Date.now()).price;
  const askPrice = roundToTick(mid);
  const r2 = await S.submitOrder({
    uid: "uA", nick: "가", symbol: sym, side: "sell", type: "limit", price: askPrice, qty: 40,
  });
  check("체결 없이 걸림", r2.filledQty === 0 && r2.order.status === "open");
  const holdA2 = (await S.getHoldings("uA"))[0];
  check("매도 물량 40주 잠김", holdA2.locked === 40, `${holdA2.locked}`);

  const book1 = await S.getBook(sym);
  check("호가창에 내 매도가 올라감", (book1.humanAsks ?? []).some((l) => l.price === askPrice && l.qty === 40));

  const cashB0 = (await S.getAccount("uB"))!.cash;
  const r3 = await S.submitOrder({
    uid: "uB", nick: "나", symbol: sym, side: "buy", type: "limit", price: askPrice, qty: 40,
  });
  check("나가 40주 다 받음", r3.filledQty === 40, `${r3.filledQty}주`);
  const takerFromHuman = r3.fills.every((f) => f.price <= askPrice);
  check("체결값이 지정가 이하", takerFromHuman);

  const accA3 = (await S.getAccount("uA"))!;
  const holdA3 = (await S.getHoldings("uA"))[0];
  check("잠긴 물량 풀림", holdA3.locked === 0, `${holdA3.locked}`);
  check("보유 60주로 감소", holdA3.qty === 60, `${holdA3.qty}`);
  check("가 예수금 증가", accA3.cash > accA1.cash);
  const accB3 = (await S.getAccount("uB"))!;
  check("나 예수금 감소", accB3.cash < cashB0);

  console.log(`\n[4] 지정가 매수 예약금과 취소 환불`);
  const bidPrice = roundToTick(q0.price * 0.9, "down");
  const beforeCash = (await S.getAccount("uB"))!.cash;
  const r4 = await S.submitOrder({
    uid: "uB", nick: "나", symbol: sym, side: "buy", type: "limit", price: bidPrice, qty: 50,
  });
  const afterCash = (await S.getAccount("uB"))!.cash;
  const reserved = beforeCash - afterCash;
  check("예약금 = 값 x 수량 + 수수료", near(reserved, bidPrice * 50 + Math.floor(bidPrice * 50 * RULES.FEE_RATE), 2), `${reserved}`);
  await S.cancelOrder("uB", r4.order.id);
  const backCash = (await S.getAccount("uB"))!.cash;
  check("취소하면 전액 환불", backCash === beforeCash, `${backCash} vs ${beforeCash}`);
  const book2 = await S.getBook(sym);
  check("호가창에서 사라짐", !(book2.humanBids ?? []).some((l) => l.price === bidPrice));

  console.log(`\n[5] 없는 돈으로 사면 막힌다`);
  let blocked = false;
  try {
    await S.submitOrder({
      uid: "uB", nick: "나", symbol: sym, side: "buy", type: "limit", price: bidPrice, qty: 100000,
    });
  } catch (e) {
    blocked = (e as Error).message.includes("예수금");
  }
  check("예수금 초과 주문 거부", blocked);

  let blocked2 = false;
  try {
    await S.submitOrder({
      uid: "uB", nick: "나", symbol: sym, side: "sell", type: "market", price: 0, qty: 9999,
    });
  } catch (e) {
    blocked2 = (e as Error).message.includes("팔 수 있는");
  }
  check("없는 주식 매도 거부", blocked2);

  console.log(`\n[6] 사람이 많이 사면 값이 오른다`);
  const before = quoteOf(asset, await S.getBook(sym), Date.now());
  // 한 사람 시드는 1,000만원이라 값을 못 민다. 스무 명이 각자 전 재산을 넣는다.
  let bought = 0;
  for (let i = 0; i < 20; i++) {
    const uid = `crowd${i}`;
    await S.ensureAccount(uid, `군중${i}`, true);
    const qty = Math.floor((RULES.SEED_CASH * 0.97) / before.price);
    const r = await S.submitOrder({
      uid, nick: `군중${i}`, symbol: sym, side: "buy", type: "market", price: 0, qty,
    });
    bought += r.filledQty;
  }
  const after = quoteOf(asset, await S.getBook(sym), Date.now());
  console.log(`      스무 명이 ${bought.toLocaleString()}주 매수`);
  check(
    "매수가 몰리자 시장가격 상승",
    after.price > before.price,
    `${Math.round(before.price).toLocaleString()} -> ${Math.round(after.price).toLocaleString()}`
  );
  check("실거래가 대비 웃돈 발생", after.premium > before.premium, `${(after.premium * 100).toFixed(2)}%`);
  console.log(`      마켓메이커 재고 ${Math.round(after.mmInventory).toLocaleString()}주`);

  console.log(`\n[7] 분봉이 쌓인다`);
  const candles = await S.getCandles(sym);
  check("체결로 분봉 생성", candles.length > 0, `${candles.length}개`);

  console.log(`\n[8] 전체 자산 보존 확인`);
  // 사람들 예수금 + 보유평가액 + 마켓메이커가 가져간 돈 = 시드 합계 언저리
  const uids = ["uA", "uB", ...Array.from({ length: 20 }, (_, i) => `crowd${i}`)];
  let totalEquity = 0;
  for (const uid of uids) {
    const a = (await S.getAccount(uid))!;
    totalEquity += a.cash;
    for (const h of await S.getHoldings(uid)) {
      const q = quoteOf(getAsset(h.symbol)!, await S.getBook(h.symbol), Date.now());
      totalEquity += q.price * h.qty;
    }
  }
  const seedTotal = RULES.SEED_CASH * uids.length;
  check(
    "총자산이 시드에서 크게 벗어나지 않음",
    totalEquity > seedTotal * 0.9 && totalEquity < seedTotal * 1.15,
    `${Math.round(totalEquity).toLocaleString()} / 시드 ${seedTotal.toLocaleString()}`
  );

  console.log(
    failed === 0
      ? `\n전부 통과했습니다.\n`
      : `\n${failed}건 실패했습니다.\n`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
