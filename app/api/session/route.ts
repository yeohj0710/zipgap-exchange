import { cleanNick, newGuestUid, randomNick, sessionFrom, signDemoToken } from "@/lib/auth";
import { hasFirebase } from "@/lib/firebase-admin";
import { handleError, ok, readJson } from "@/lib/api";
import { canTrade, store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  nick?: string;
}

/** 계정을 열거나, 이미 있으면 그대로 준다 */
export async function POST(req: Request) {
  try {
    const body = await readJson<Body>(req);
    const s = store();
    const live = hasFirebase();

    // 데이터베이스가 없는 곳에 올라가 있으면 보기만 할 수 있다
    if (!canTrade()) {
      return ok({ account: null, live: false, token: null, readOnly: true });
    }

    const sess = await sessionFrom(req);
    if (sess) {
      const acc = await s.ensureAccount(sess.uid, cleanNick(body.nick ?? "") || randomNick(), sess.anon);
      return ok({ account: acc, live, token: live ? null : signDemoToken(sess.uid) });
    }

    if (live) {
      return ok({ account: null, live, token: null, needsLogin: true });
    }

    // 데모 모드: 서버가 게스트 계정을 만들어 준다
    const uid = newGuestUid();
    const acc = await s.ensureAccount(uid, cleanNick(body.nick ?? "") || randomNick(), true);
    return ok({ account: acc, live, token: signDemoToken(uid) });
  } catch (e) {
    return handleError(e);
  }
}
