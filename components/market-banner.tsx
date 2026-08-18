"use client";

import Link from "next/link";
import { useState } from "react";
import { useMarket, useSession } from "./providers";

/**
 * 데이터 상태와 접속 상태를 알려 준다.
 * 예전엔 긴 문장 셋을 한 줄에 늘어놓아서 정작 중요한 "주문이 안 나간다" 가 묻혔다.
 * 지금은 상태 이름만 앞에 두고 까닭은 접어 둔다.
 */
export function MarketBanner({ version, status }: { version: string; status: string }) {
  const { connected } = useMarket();
  const { live, account, ready, readOnly, openAccount, busy } = useSession();
  const [open, setOpen] = useState(false);

  const seed = status !== "real";

  const mode = readOnly
    ? { title: "보기 전용", short: "주문은 안 나갑니다" }
    : !live
      ? { title: "체험 모드", short: "거래 기록이 안 남습니다" }
      : { title: connected ? "시세 받는 중" : "연결 확인 중", short: `실거래가 기준 ${version}` };

  const notes: string[] = [];
  if (seed) notes.push("시세는 표본값입니다. 실거래가 원자료를 아직 안 붙였습니다.");
  if (readOnly) {
    notes.push(
      "데이터베이스를 아직 안 붙여 보기만 됩니다. 값과 호가는 진짜처럼 움직이지만 주문은 안 나갑니다."
    );
  } else if (!live) {
    notes.push("데이터베이스를 안 붙여 체험 모드로 돕니다. 거래 기록이 남지 않습니다.");
  }
  if (!seed) notes.push(`실거래가 원자료 기준 ${version} 입니다.`);

  return (
    <div className="mb-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 text-[13px]">
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              connected ? "bg-emerald-500" : "bg-[var(--color-dim)]"
            }`}
          />
          <span className="font-semibold text-[var(--color-ink)]">{mode.title}</span>
        </span>
        <span className="text-[var(--color-mute)]">{mode.short}</span>

        {seed && (
          <span className="rounded border border-[var(--color-line)] px-1.5 py-px text-[12.5px] text-[var(--color-accent-ink)]">
            시세는 표본값
          </span>
        )}

        {notes.length > 0 && (
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            className="text-[12.5px] text-[var(--color-mute)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            {open ? "접기 ▴" : "자세히 ▾"}
          </button>
        )}

        {ready && !account && !readOnly && (
          <button
            onClick={() => void openAccount()}
            disabled={busy}
            className="ml-auto rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[13px] font-semibold text-black hover:brightness-110 disabled:opacity-50"
          >
            계좌 열고 시작하기
          </button>
        )}
        {ready && (account || readOnly) && (
          <Link
            href="/guide"
            className="ml-auto shrink-0 text-[13px] text-[var(--color-mute)] hover:text-[var(--color-ink)]"
          >
            거래 규칙 보기 →
          </Link>
        )}
      </div>

      {open && notes.length > 0 && (
        <div className="border-t border-[var(--color-line)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--color-mute)]">
          {notes.map((n) => (
            <p key={n} className="mt-1 first:mt-0">
              {n}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
