import { fail, handleError, ok, readJson } from "@/lib/api";
import { cleanNick, sessionFrom } from "@/lib/auth";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const sess = await sessionFrom(req);
    if (!sess) return fail("로그인이 필요합니다.", 401);
    const { nick } = await readJson<{ nick?: string }>(req);
    const clean = cleanNick(nick ?? "");
    if (!clean) return fail("이름은 두 글자 넘게 써 주세요.");
    const account = await store().updateNick(sess.uid, clean);
    return ok({ account });
  } catch (e) {
    return handleError(e);
  }
}
