import { fail, handleError, ok, readJson } from "@/lib/api";
import { sessionFrom } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const sess = await sessionFrom(req);
    if (!sess) return fail("로그인이 필요합니다.", 401);
    const { orderId } = await readJson<{ orderId?: string }>(req);
    if (!orderId) return fail("주문을 고르세요.");
    await store().cancelOrder(sess.uid, orderId);
    return ok({ cancelled: orderId });
  } catch (e) {
    return handleError(e);
  }
}
