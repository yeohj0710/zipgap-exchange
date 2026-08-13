"use client";

import { useMemo } from "react";
import { bookLevels, type Quote } from "@/lib/quote";
import { pct, qty as fq, toneClass, won } from "@/lib/format";
import type { Asset } from "@/lib/types";
import type { BookState } from "@/lib/store/types";

export function OrderBook({
  asset,
  book,
  quote,
  now,
  onPick,
}: {
  asset: Asset;
  book: BookState;
  quote: Quote;
  now: number;
  onPick: (price: number) => void;
}) {
  // 8단이면 440px 안에 딱 들어간다. 더 늘리면 아래가 잘린다
  const levels = useMemo(() => bookLevels(asset, book, now, 8), [asset, book, now]);
  const maxQty = useMemo(
    () => Math.max(1, ...levels.bids.map((l) => l.qty), ...levels.asks.map((l) => l.qty)),
    [levels]
  );

  const Row = ({
    price,
    qty,
    side,
  }: {
    price: number;
    qty: number;
    side: "bid" | "ask";
  }) => {
    const w = (qty / maxQty) * 100;
    const color = side === "ask" ? "var(--color-down)" : "var(--color-up)";
    return (
      <button
        onClick={() => onPick(price)}
        className="relative grid w-full grid-cols-2 items-center px-3 py-[3px] text-[12px] transition-colors hover:bg-[var(--color-panel2)]"
      >
        <span
          className="absolute inset-y-px right-0 rounded-l-sm"
          style={{ width: `${w}%`, background: color, opacity: 0.11 }}
        />
        <span className={`num relative text-left ${side === "ask" ? "text-down" : "text-up"}`}>
          {won(price)}
        </span>
        <span className="num relative text-right text-[var(--color-mute)]">{fq(qty)}</span>
      </button>
    );
  };

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-line)] px-3 py-2">
        <span className="text-[12px] text-[var(--color-mute)]">호가</span>
        <span className="text-[11px] text-[var(--color-dim)]">값 / 수량</span>
      </div>

      <div className="flex flex-1 flex-col justify-end pt-1">
        {[...levels.asks].reverse().map((l) => (
          <Row key={"a" + l.price} price={l.price} qty={l.qty} side="ask" />
        ))}
      </div>

      <div className="my-1 flex items-center justify-between border-y border-[var(--color-line)] bg-[var(--color-panel2)] px-3 py-2">
        <span className={`num text-[15px] font-bold ${toneClass(quote.changeRate)}`}>
          {won(quote.price)}
        </span>
        <span className={`num text-[11.5px] ${toneClass(quote.premium)}`}>
          실거래가 {pct(quote.premium)}
        </span>
      </div>

      <div className="flex flex-1 flex-col pb-1">
        {levels.bids.map((l) => (
          <Row key={"b" + l.price} price={l.price} qty={l.qty} side="bid" />
        ))}
      </div>
    </div>
  );
}
