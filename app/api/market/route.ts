import { handleError, ok } from "@/lib/api";
import { getAssets, LISTINGS_STATUS, LISTINGS_VERSION } from "@/lib/market";
import { quoteOf } from "@/lib/quote";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 전 종목 시세. Firestore 를 붙이기 전 브라우저가 이걸로 값을 받아 간다 */
export async function GET() {
  try {
    const s = store();
    const books = await s.getAllBooks();
    const now = Date.now();
    const quotes = getAssets().map((a) => quoteOf(a, books[a.symbol], now));
    return ok({
      quotes,
      books,
      now,
      dataVersion: LISTINGS_VERSION,
      dataStatus: LISTINGS_STATUS,
    });
  } catch (e) {
    return handleError(e);
  }
}
