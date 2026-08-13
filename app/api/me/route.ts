import { handleError, fail, ok } from "@/lib/api";
import { sessionFrom } from "@/lib/auth";
import { getAsset } from "@/lib/market";
import { quoteOf } from "@/lib/quote";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 내 계정·보유·미체결·체결내역을 한 번에 준다 */
export async function GET(req: Request) {
  try {
    const sess = await sessionFrom(req);
    if (!sess) return fail("로그인이 필요합니다.", 401);
    const s = store();

    const dividend = await s.settleDividend(sess.uid);
    const account = await s.getAccount(sess.uid);
    if (!account) return fail("계정이 없습니다.", 404);

    const holdings = await s.getHoldings(sess.uid);
    const now = Date.now();

    let holdingValue = 0;
    const rows = [];
    for (const h of holdings) {
      const asset = getAsset(h.symbol);
      if (!asset) continue;
      const book = await s.getBook(h.symbol);
      const q = quoteOf(asset, book, now);
      const value = q.price * h.qty;
      holdingValue += value;
      rows.push({
        symbol: h.symbol,
        name: asset.name,
        qty: h.qty,
        locked: h.locked,
        avgPrice: h.avgPrice,
        price: q.price,
        value,
        pnl: value - h.avgPrice * h.qty,
        pnlRate: h.avgPrice > 0 ? (q.price - h.avgPrice) / h.avgPrice : 0,
      });
    }

    const orders = (await s.getMyOrders(sess.uid)).filter((o) => o.status === "open");
    const fills = await s.getMyFills(sess.uid, 50);
    const equity = account.cash + holdingValue;

    await s.recordEquity(sess.uid, account.nick, equity, account.seed);

    return ok({
      account,
      holdings: rows,
      orders,
      fills,
      equity,
      holdingValue,
      dividendPaid: dividend,
    });
  } catch (e) {
    return handleError(e);
  }
}
