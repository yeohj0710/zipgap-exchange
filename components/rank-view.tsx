"use client";

import { useEffect, useState } from "react";
import { useSession } from "./providers";
import { pct, toneClass, won } from "@/lib/format";
import type { RankRow } from "@/lib/types";

export function RankView() {
  const { account } = useSession();
  const [rows, setRows] = useState<RankRow[] | null>(null);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const res = await fetch("/api/rank", { cache: "no-store" });
        const json = await res.json();
        if (alive && json?.ok) setRows(json.rows as RankRow[]);
      } catch {
        if (alive) setRows([]);
      }
    };
    void pull();
    const id = setInterval(pull, 20_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="pt-5">
      <h1 className="text-[20px] font-bold tracking-tight">랭킹</h1>
      <p className="mt-1 text-[13px] text-[var(--color-mute)]">
        수익률 순입니다. 한 번이라도 자산 화면을 연 사람만 올라갑니다
      </p>

      <div className="panel mt-4 overflow-hidden">
        <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2 border-b border-[var(--color-line)] px-4 py-2.5 text-[12px] text-[var(--color-dim)]">
          <span>순위</span>
          <span>이름</span>
          <span className="text-right">평가액</span>
          <span className="text-right">수익률</span>
        </div>

        {rows === null ? (
          <div className="px-4 py-12 text-center text-[13px] text-[var(--color-dim)]">
            불러오는 중
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-[13px] text-[var(--color-dim)]">
            아직 아무도 없습니다. 첫 번째로 이름을 올려 보세요
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-line)]">
            {rows.map((r, i) => {
              const mine = account?.uid === r.uid;
              return (
                <div
                  key={r.uid}
                  className={`grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 px-4 py-2.5 ${
                    mine ? "bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]" : ""
                  }`}
                >
                  <span
                    className={`num text-[13px] ${
                      i < 3 ? "font-bold text-[var(--color-accent)]" : "text-[var(--color-dim)]"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="truncate text-[13.5px]">
                    {r.nick}
                    {mine && <span className="ml-1.5 text-[11px] text-[var(--color-accent)]">나</span>}
                  </span>
                  <span className="num text-right text-[13px]">{won(r.equity)}원</span>
                  <span className={`num text-right text-[13px] font-semibold ${toneClass(r.pnlRate)}`}>
                    {pct(r.pnlRate)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
