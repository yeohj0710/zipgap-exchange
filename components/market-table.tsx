"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMarket } from "./providers";
import { Sparkline } from "./sparkline";
import { getAssets, lastRealPrice, navYearlyChange } from "@/lib/market";
import { eok, pct, qty, toneClass, won } from "@/lib/format";
import type { Asset } from "@/lib/types";

type SortKey = "name" | "price" | "change" | "premium" | "volume" | "year";
type Filter = "all" | "index" | "complex";

const SIDOS = ["전지역", "서울", "경기", "인천", "부산", "전국", "광역시"];

export function MarketTable() {
  const { quotes } = useMarket();
  const [sort, setSort] = useState<SortKey>("name");
  const [desc, setDesc] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [sido, setSido] = useState("전지역");
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list: Asset[] = getAssets();
    if (filter !== "all") list = list.filter((a) => a.kind === filter);
    if (sido !== "전지역") list = list.filter((a) => a.sido === sido);
    if (term) {
      list = list.filter((a) =>
        [a.name, a.alias ?? "", a.symbol, a.region].join(" ").toLowerCase().includes(term)
      );
    }
    const val = (a: Asset): number | string => {
      const qt = quotes[a.symbol];
      switch (sort) {
        case "price":
          return qt?.price ?? 0;
        case "change":
          return qt?.changeRate ?? 0;
        case "premium":
          return qt?.premium ?? 0;
        case "volume":
          return qt?.volume ?? 0;
        case "year":
          return navYearlyChange(a);
        default:
          return a.name;
      }
    };
    return [...list].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      const r = typeof x === "string" ? String(x).localeCompare(String(y)) : (x as number) - (y as number);
      return desc ? -r : r;
    });
  }, [filter, sido, q, sort, desc, quotes]);

  const head = (key: SortKey, label: string, className = "") => (
    <button
      onClick={() => {
        if (sort === key) setDesc(!desc);
        else {
          setSort(key);
          setDesc(key !== "name");
        }
      }}
      className={`w-full text-[12px] text-[var(--color-dim)] transition-colors hover:text-[var(--color-ink)] ${className}`}
    >
      {label}
      {sort === key ? (desc ? " ↓" : " ↑") : ""}
    </button>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[var(--color-line)] p-0.5">
          {(
            [
              ["all", "전체"],
              ["index", "지수"],
              ["complex", "단지"],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                filter === k
                  ? "bg-[var(--color-panel2)] text-[var(--color-ink)]"
                  : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {SIDOS.map((s) => (
            <button
              key={s}
              onClick={() => setSido(s)}
              className={`rounded-md px-2 py-1 text-[12px] transition-colors ${
                sido === s
                  ? "bg-[var(--color-panel2)] text-[var(--color-ink)]"
                  : "text-[var(--color-dim)] hover:text-[var(--color-mute)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="단지 이름으로 찾기"
          className="ml-auto w-full min-w-0 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-1.5 text-[13px] outline-none placeholder:text-[var(--color-dim)] focus:border-[var(--color-line2)] sm:w-52"
        />
      </div>

      <div className="panel overflow-hidden">
        {/* 표 머리 — 좁은 화면에서는 숨긴다 */}
        <div className="hidden grid-cols-[minmax(0,2.2fr)_5rem_repeat(4,minmax(0,1fr))] items-center gap-2 border-b border-[var(--color-line)] px-4 py-2.5 md:grid">
          {head("name", "종목", "text-left")}
          <span className="text-center text-[12px] text-[var(--color-dim)]">추세</span>
          {head("price", "현재가", "text-right")}
          {head("change", "전일대비", "text-right")}
          {head("premium", "실거래가 대비", "text-right")}
          {head("volume", "거래량", "text-right")}
        </div>

        <div className="divide-y divide-[var(--color-line)]">
          {rows.map((a) => {
            // 시계가 붙기 전에는 값 자리를 비워 둔다. 이름과 위치는 그대로 내보낸다
            const qt = quotes[a.symbol];
            return (
              <Link
                key={a.symbol}
                href={`/t/${a.symbol}`}
                prefetch={false}
                className="grid grid-cols-2 items-center gap-x-2 gap-y-1 px-4 py-3 transition-colors hover:bg-[var(--color-panel2)] md:grid-cols-[minmax(0,2.2fr)_5rem_repeat(4,minmax(0,1fr))] md:gap-2"
              >
                <div className="col-span-2 min-w-0 md:col-span-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold">{a.name}</span>
                    {a.kind === "index" && (
                      <span className="shrink-0 rounded border border-[var(--color-line2)] px-1.5 py-px text-[10px] text-[var(--color-dim)]">
                        지수
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-[var(--color-dim)]">
                    {a.region}
                    {a.unitArea ? ` · 전용 ${a.unitArea}㎡` : ""} · 한 채 {eok(lastRealPrice(a))}
                  </div>
                </div>

                <div className="hidden justify-center md:flex">
                  <Sparkline asset={a} width={64} height={26} />
                </div>

                <div className="num text-left text-[15px] font-semibold md:text-right">
                  {qt ? won(qt.price) : "—"}
                  <span className="ml-0.5 text-[11px] font-normal text-[var(--color-dim)]">원</span>
                </div>

                <div
                  className={`num text-right text-[13px] md:text-right ${
                    qt ? toneClass(qt.changeRate) : "text-mute"
                  }`}
                >
                  {qt ? pct(qt.changeRate) : "—"}
                </div>

                <div className="num text-left text-[13px] md:text-right">
                  <span className={qt ? toneClass(qt.premium) : "text-mute"}>
                    {qt ? pct(qt.premium) : "—"}
                  </span>
                </div>

                <div className="num text-right text-[13px] text-[var(--color-mute)]">
                  {qt && qt.volume > 0 ? qty(qt.volume) : "-"}
                </div>
              </Link>
            );
          })}
          {rows.length === 0 && (
            <div className="px-4 py-12 text-center text-[13px] text-[var(--color-dim)]">
              찾는 종목이 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
