"use client";

import { qty as fq, timeOf, won } from "@/lib/format";
import type { Trade } from "@/lib/types";

export function TradeTape({ trades }: { trades: Trade[] }) {
  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <span className="text-[12px] text-[var(--color-mute)]">최근 체결</span>
        <span className="text-[11px] text-[var(--color-dim)]">시각 / 값 / 수량</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-[var(--color-dim)]">
            아직 체결이 없습니다. 첫 거래를 걸어 보세요
          </p>
        ) : (
          trades.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-2 px-3 py-[3px] text-[12px]"
            >
              <span className="num text-[var(--color-dim)]">{timeOf(t.ts)}</span>
              <span className={`num text-right ${t.taker === "buy" ? "text-up" : "text-down"}`}>
                {won(t.price)}
              </span>
              <span className="num w-14 text-right text-[var(--color-mute)]">{fq(t.qty)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
