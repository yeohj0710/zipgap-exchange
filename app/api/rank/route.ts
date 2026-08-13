import { handleError, ok } from "@/lib/api";
import { store } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await store().leaderboard(50);
    return ok({ rows });
  } catch (e) {
    return handleError(e);
  }
}
