import { fail, handleError, ok, readJson } from "@/lib/api";
import { sessionFrom } from "@/lib/auth";
import { getAsset } from "@/lib/market";
import { quoteOf } from "@/lib/quote";
import { store } from "@/lib/store";
import type { OrderType, Side } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  symbol?: string;
  side?: Side;
  type?: OrderType;
  price?: number;
  qty?: number;
}

export async function POST(req: Request) {
  try {
    const sess = await sessionFrom(req);
    if (!sess) return fail("로그인이 필요합니다.", 401);

    const b = await readJson<Body>(req);
    if (!b.symbol) return fail("종목을 고르세요.");
    if (b.side !== "buy" && b.side !== "sell") return fail("매수/매도를 고르세요.");
    if (b.type !== "limit" && b.type !== "market") return fail("주문 방식을 고르세요.");

    const asset = getAsset(b.symbol);
    if (!asset) return fail("없는 종목입니다.");

    const s = store();
    const account = await s.getAccount(sess.uid);
    if (!account) return fail("계정을 먼저 만들어 주세요.", 401);

    const res = await s.submitOrder({
      uid: sess.uid,
      nick: account.nick,
      symbol: asset.symbol,
      side: b.side,
      type: b.type,
      price: Number(b.price ?? 0),
      qty: Number(b.qty ?? 0),
    });

    const book = await s.getBook(asset.symbol);
    return ok({ result: res, quote: quoteOf(asset, book, Date.now()) });
  } catch (e) {
    return handleError(e);
  }
}
