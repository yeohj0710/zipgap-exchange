import { NextResponse } from "next/server";
import { OrderError } from "./order-core";

export function ok<T>(data: T) {
  return NextResponse.json({ ok: true, ...data }, { headers: { "cache-control": "no-store" } });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, message }, { status, headers: { "cache-control": "no-store" } });
}

export function handleError(e: unknown) {
  if (e instanceof OrderError) return fail(e.message, 400);
  const msg = e instanceof Error ? e.message : "알 수 없는 오류입니다.";
  console.error("[zipgap]", e);
  return fail(msg, 500);
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
