"use client";

import Link from "next/link";
import { useState } from "react";
import { useMarket, useSession, useSymbolBook } from "@/components/providers";
import { CandleChart } from "./candle-chart";
import { OrderBook } from "./order-book";
import { OrderForm } from "./order-form";
import { TradeTape } from "./trade-tape";
import { MyOrders } from "./my-orders";
import { eok, pct, qty as fq, toneClass, won } from "@/lib/format";
import {
  lastRealPrice,
  navMonthlyChange,
  navYearlyChange,
  toSharePrice,
} from "@/lib/market";
import type { Asset, Candle } from "@/lib/types";

function Placeholder({ label }: { label: string }) {
  return (
    <div className="panel grid h-full place-items-center text-[12.5px] text-[var(--color-dim)]">
      {label}
    </div>
  );
}

export function TradeScreen({ asset }: { asset: Asset }) {
  const { now, mounted, quotes } = useMarket();
  const { me } = useSession();
  const book = useSymbolBook(asset.symbol);
  const [picked, setPicked] = useState<number | null>(null);
  const [pane, setPane] = useState<"chart" | "book">("chart");

  const quote = quotes[asset.symbol];
  const candles = ((book as { candles?: Candle[] }).candles ?? []) as Candle[];
  const holding = me?.holdings.find((h) => h.symbol === asset.symbol);
  const navShare = toSharePrice(asset, lastRealPrice(asset));

  return (
    <div className="pt-4">
      <Link
        href="/"
        className="mb-2.5 inline-block text-[12.5px] text-[var(--color-dim)] hover:text-[var(--color-ink)]"
      >
        ← 시장으로
      </Link>

      {/* 머리 */}
      <div className="panel mb-3 flex flex-wrap items-end gap-x-6 gap-y-3 px-4 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-[19px] font-bold tracking-tight">{asset.name}</h1>
            <span className="shrink-0 rounded border border-[var(--color-line2)] px-1.5 py-px text-[10.5px] text-[var(--color-dim)]">
              {asset.symbol}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-[var(--color-dim)]">
            {asset.region}
            {asset.unitArea ? ` · 전용 ${asset.unitArea}㎡` : ""}
            {asset.households ? ` · ${fq(asset.households)}세대` : ""}
            {asset.builtYear ? ` · ${asset.builtYear}년` : ""}
          </p>
        </div>

        <div className="flex items-baseline gap-2.5">
          <span
            className={`num text-[28px] font-bold leading-none ${
              quote ? toneClass(quote.changeRate) : "text-mute"
            }`}
          >
            {quote ? won(quote.price) : "—"}
          </span>
          <span className="text-[13px] text-[var(--color-dim)]">원</span>
          <span
            className={`num text-[14px] font-semibold ${
              quote ? toneClass(quote.changeRate) : "text-mute"
            }`}
          >
            {quote ? pct(quote.changeRate) : ""}
          </span>
        </div>

        <div className="ml-auto grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-4">
          <Stat label="실물 한 채" value={eok(lastRealPrice(asset))} />
          <Stat
            label="실거래가 대비"
            value={quote ? pct(quote.premium) : "—"}
            tone={quote?.premium}
            hint="시장가격이 실거래가보다 얼마나 비싼지"
          />
          <Stat label="1년 실거래" value={pct(navYearlyChange(asset))} tone={navYearlyChange(asset)} />
          <Stat
            label="오늘 거래량"
            value={quote && quote.volume > 0 ? `${fq(quote.volume)}주` : "-"}
          />
        </div>
      </div>

      {holding && holding.qty > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2.5 text-[12.5px]">
          <span className="text-[var(--color-mute)]">내 보유</span>
          <span className="num font-semibold">{fq(holding.qty)}주</span>
          <span className="text-[var(--color-dim)]">
            평단 <span className="num">{won(holding.avgPrice)}</span>원
          </span>
          <span className="text-[var(--color-dim)]">
            평가 <span className="num">{won(holding.value)}</span>원
          </span>
          <span className={`num ml-auto font-semibold ${toneClass(holding.pnl)}`}>
            {holding.pnl >= 0 ? "+" : ""}
            {won(holding.pnl)}원 ({pct(holding.pnlRate)})
          </span>
        </div>
      )}

      {/* 좁은 화면 전환 */}
      <div className="mb-2 flex rounded-lg border border-[var(--color-line)] p-0.5 lg:hidden">
        {(
          [
            ["chart", "차트"],
            ["book", "호가"],
          ] as ["chart" | "book", string][]
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPane(k)}
            className={`flex-1 rounded-md py-1.5 text-[13px] transition-colors ${
              pane === k
                ? "bg-[var(--color-panel2)] text-[var(--color-ink)]"
                : "text-[var(--color-dim)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem_19rem]">
        <div className={`h-[380px] lg:h-[440px] ${pane === "chart" ? "" : "hidden lg:block"}`}>
          {mounted ? (
            <CandleChart asset={asset} realCandles={candles} now={now} />
          ) : (
            <Placeholder label="차트를 그리는 중" />
          )}
        </div>

        <div className={`h-[380px] lg:h-[440px] ${pane === "book" ? "" : "hidden lg:block"}`}>
          {mounted && quote ? (
            <OrderBook
              asset={asset}
              book={book}
              quote={quote}
              now={now}
              onPick={(p) => setPicked(p)}
            />
          ) : (
            <Placeholder label="호가를 받는 중" />
          )}
        </div>

        {mounted && quote ? (
          <OrderForm asset={asset} quote={quote} picked={picked} onDone={() => setPicked(null)} />
        ) : (
          <div className="panel h-[380px]" />
        )}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="h-44 sm:h-64">
          <MyOrders symbol={asset.symbol} />
        </div>
        <div className="h-44 sm:h-64">
          <TradeTape trades={book.recentTrades ?? []} />
        </div>
      </div>

      <div className="panel mt-3 px-4 py-3.5">
        <h2 className="mb-2 text-[13px] font-semibold">이 종목이 뭔지</h2>
        <p className="text-[13px] leading-relaxed text-[var(--color-mute)]">
          {asset.kind === "index" ? (
            <>
              {asset.region}의 실거래가를 하나로 묶은 지수입니다. 대표 주택 한 채 값이{" "}
              {eok(lastRealPrice(asset))}이고, 그 {fq(asset.shareDivisor)}분의 1이 한 주입니다.
            </>
          ) : (
            <>
              {asset.region}에 있는 {asset.name}입니다.
              {asset.unitArea ? ` 전용 ${asset.unitArea}㎡ 실거래가를 기준으로 삼습니다.` : ""} 한
              채가 {eok(lastRealPrice(asset))}이니 그 {fq(asset.shareDivisor)}분의 1인{" "}
              {won(navShare)}원이 한 주의 실거래가입니다.
            </>
          )}{" "}
          지난달 실거래가는 {pct(navMonthlyChange(asset))} 움직였고, 연 {(asset.rentYield * 100).toFixed(1)}
          % 임대수익률을 매달 쪼개 월세로 넣어 줍니다.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {asset.tags.map((t) => (
            <span
              key={t}
              className="rounded border border-[var(--color-line2)] px-2 py-0.5 text-[11px] text-[var(--color-dim)]"
            >
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: number | undefined;
  hint?: string;
}) {
  return (
    <div title={hint}>
      <div className="text-[11px] text-[var(--color-dim)]">{label}</div>
      <div className={`num mt-0.5 font-semibold ${tone !== undefined ? toneClass(tone) : ""}`}>
        {value}
      </div>
    </div>
  );
}
