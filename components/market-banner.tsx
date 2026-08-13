"use client";

import Link from "next/link";
import { useMarket, useSession } from "./providers";

/** 데이터 상태와 접속 상태를 한 줄로 알려 준다 */
export function MarketBanner({ version, status }: { version: string; status: string }) {
  const { connected } = useMarket();
  const { live, account, ready, readOnly, openAccount, busy } = useSession();

  const seed = status !== "real";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3.5 py-2.5 text-[12.5px]">
      <span className="flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? "bg-emerald-400" : "bg-[var(--color-dim)]"
          }`}
        />
        <span className="text-[var(--color-mute)]">
          {connected ? "시세 받는 중" : "연결 확인 중"}
        </span>
      </span>

      <span className="text-[var(--color-line2)]">|</span>

      {seed ? (
        <span className="text-[var(--color-mute)]">
          시세는 <span className="text-[var(--color-accent)]">표본값</span>입니다. 실거래가 원자료를
          아직 안 붙였습니다
        </span>
      ) : (
        <span className="text-[var(--color-mute)]">실거래가 기준 {version}</span>
      )}

      {!live && (
        <>
          <span className="text-[var(--color-line2)]">|</span>
          <span className="text-[var(--color-mute)]">
            {readOnly ? (
              <>
                데이터베이스를 아직 안 붙여{" "}
                <span className="text-[var(--color-accent)]">보기만 됩니다</span>. 값과 호가는
                진짜처럼 움직이지만 주문은 안 나갑니다
              </>
            ) : (
              <>
                데이터베이스를 안 붙여 <span className="text-[var(--color-accent)]">체험 모드</span>로
                돕니다. 거래 기록이 남지 않습니다
              </>
            )}
          </span>
        </>
      )}

      {ready && !account && !readOnly && (
        <button
          onClick={() => void openAccount()}
          disabled={busy}
          className="ml-auto rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[12px] font-semibold text-black hover:brightness-110 disabled:opacity-50"
        >
          계좌 열고 시작하기
        </button>
      )}
      {ready && (account || readOnly) && (
        <Link
          href="/guide"
          className="ml-auto shrink-0 text-[12px] text-[var(--color-dim)] hover:text-[var(--color-ink)]"
        >
          거래 규칙 보기 →
        </Link>
      )}
    </div>
  );
}
