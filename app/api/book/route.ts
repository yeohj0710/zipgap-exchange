import { fail, handleError, ok } from "@/lib/api";
import { getAsset } from "@/lib/market";
import { bookLevels, quoteOf } from "@/lib/quote";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const symbol = new URL(req.url).searchParams.get("symbol") ?? "";
    const asset = getAsset(symbol);
    if (!asset) return fail("없는 종목입니다.", 404);
    const book = await store().getBook(asset.symbol);
    const now = Date.now();
    return ok({
      book,
      quote: quoteOf(asset, book, now),
      levels: bookLevels(asset, book, now),
      now,
    });
  } catch (e) {
    return handleError(e);
  }
}
