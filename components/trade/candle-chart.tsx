"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { candleSeries, navSeries, TIMEFRAMES, type TimeframeKey } from "@/lib/chart";
import { dateOf, won } from "@/lib/format";
import type { Asset, Candle } from "@/lib/types";

const PAD = { top: 12, right: 62, bottom: 20, left: 8 };
const VOL_H = 42;

export function CandleChart({
  asset,
  realCandles,
  now,
}: {
  asset: Asset;
  realCandles: Candle[];
  now: number;
}) {
  const [tf, setTf] = useState<TimeframeKey>("10m");
  const [size, setSize] = useState({ w: 720, h: 340 });
  const [hover, setHover] = useState<number | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const candles = useMemo(
    () => candleSeries(asset, tf, now, realCandles),
    [asset, tf, now, realCandles]
  );
  const navLine = useMemo(() => navSeries(asset, candles), [asset, candles]);

  const view = useMemo(() => {
    const w = Math.max(320, size.w);
    const h = Math.max(240, size.h);
    const plotW = w - PAD.left - PAD.right;
    const plotH = h - PAD.top - PAD.bottom - VOL_H;

    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      if (c.l < lo) lo = c.l;
      if (c.h > hi) hi = c.h;
    }
    for (const n of navLine) {
      if (n.v < lo) lo = n.v;
      if (n.v > hi) hi = n.v;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    const pad = (hi - lo) * 0.08 || hi * 0.02 || 1;
    lo -= pad;
    hi += pad;

    const maxVol = Math.max(1, ...candles.map((c) => c.v));
    const n = candles.length;
    const step = plotW / Math.max(1, n);
    const bw = Math.max(1.5, Math.min(11, step * 0.62));

    const x = (i: number) => PAD.left + step * (i + 0.5);
    const y = (v: number) => PAD.top + plotH - ((v - lo) / (hi - lo)) * plotH;
    const vy = (v: number) => PAD.top + plotH + VOL_H - (v / maxVol) * (VOL_H - 6);

    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) ticks.push(lo + ((hi - lo) * i) / 4);

    return { w, h, plotW, plotH, lo, hi, step, bw, x, y, vy, ticks, n };
  }, [candles, navLine, size]);

  const navPath = useMemo(() => {
    if (!navLine.length) return "";
    return navLine
      .map((p, i) => `${i === 0 ? "M" : "L"}${view.x(i).toFixed(1)},${view.y(p.v).toFixed(1)}`)
      .join(" ");
  }, [navLine, view]);

  const hoverCandle = hover !== null ? candles[hover] : null;
  const hoverNav = hover !== null ? navLine[hover] : null;
  const lastCandle = candles[candles.length - 1];

  return (
    <div className="panel flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-1 border-b border-[var(--color-line)] px-3 py-2">
        {TIMEFRAMES.map((t) => (
          <button
            key={t.key}
            onClick={() => setTf(t.key)}
            className={`rounded px-2 py-1 text-[12px] transition-colors ${
              tf === t.key
                ? "bg-[var(--color-panel2)] text-[var(--color-ink)]"
                : "text-[var(--color-dim)] hover:text-[var(--color-mute)]"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3 text-[11.5px]">
          <span className="flex items-center gap-1.5 text-[var(--color-dim)]">
            <span className="inline-block h-px w-4 border-t border-dashed border-[var(--color-accent)]" />
            실거래가
          </span>
          {hoverCandle && (
            <span className="num text-[var(--color-mute)]">
              {dateOf(hoverCandle.t)} · {won(hoverCandle.c)}원
              {hoverNav ? ` · 실거래 ${won(hoverNav.v)}원` : ""}
            </span>
          )}
        </div>
      </div>

      <div ref={wrap} className="relative min-h-[260px] flex-1">
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${view.w} ${view.h}`}
          preserveAspectRatio="none"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const px = ((e.clientX - rect.left) / rect.width) * view.w;
            const i = Math.floor((px - PAD.left) / view.step);
            setHover(i >= 0 && i < view.n ? i : null);
          }}
          onMouseLeave={() => setHover(null)}
        >
          {/* 가로 눈금 */}
          {view.ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD.left}
                x2={view.w - PAD.right}
                y1={view.y(t)}
                y2={view.y(t)}
                stroke="var(--color-line)"
                strokeWidth="1"
              />
              <text
                x={view.w - PAD.right + 6}
                y={view.y(t) + 3.5}
                fill="var(--color-dim)"
                fontSize="10.5"
                className="num"
              >
                {won(t)}
              </text>
            </g>
          ))}

          {/* 봉 */}
          {candles.map((c, i) => {
            const up = c.c >= c.o;
            const color = up ? "var(--color-up)" : "var(--color-down)";
            const yo = view.y(c.o);
            const yc = view.y(c.c);
            const top = Math.min(yo, yc);
            const bh = Math.max(1, Math.abs(yc - yo));
            return (
              <g key={c.t}>
                <line
                  x1={view.x(i)}
                  x2={view.x(i)}
                  y1={view.y(c.h)}
                  y2={view.y(c.l)}
                  stroke={color}
                  strokeWidth="1"
                  opacity={c.v > 0 ? 1 : 0.55}
                />
                <rect
                  x={view.x(i) - view.bw / 2}
                  y={top}
                  width={view.bw}
                  height={bh}
                  fill={color}
                  opacity={c.v > 0 ? 1 : 0.55}
                />
                {c.v > 0 && (
                  <rect
                    x={view.x(i) - view.bw / 2}
                    y={view.vy(c.v)}
                    width={view.bw}
                    height={Math.max(1, PAD.top + view.plotH + VOL_H - view.vy(c.v))}
                    fill={color}
                    opacity="0.4"
                  />
                )}
              </g>
            );
          })}

          {/* 실거래가 선 */}
          <path
            d={navPath}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth="1.4"
            strokeDasharray="4 3"
            opacity="0.85"
          />

          {/* 현재가 선 */}
          {lastCandle && (
            <>
              <line
                x1={PAD.left}
                x2={view.w - PAD.right}
                y1={view.y(lastCandle.c)}
                y2={view.y(lastCandle.c)}
                stroke="var(--color-ink)"
                strokeWidth="0.8"
                strokeDasharray="2 3"
                opacity="0.45"
              />
              <rect
                x={view.w - PAD.right + 2}
                y={view.y(lastCandle.c) - 8}
                width={PAD.right - 4}
                height={16}
                rx="3"
                fill={lastCandle.c >= lastCandle.o ? "var(--color-up)" : "var(--color-down)"}
              />
              <text
                x={view.w - PAD.right + 6}
                y={view.y(lastCandle.c) + 3.5}
                fill="#fff"
                fontSize="10.5"
                fontWeight="600"
                className="num"
              >
                {won(lastCandle.c)}
              </text>
            </>
          )}

          {/* 마우스 세로선 */}
          {hover !== null && candles[hover] && (
            <line
              x1={view.x(hover)}
              x2={view.x(hover)}
              y1={PAD.top}
              y2={PAD.top + view.plotH + VOL_H}
              stroke="var(--color-line2)"
              strokeWidth="1"
            />
          )}
        </svg>
      </div>
    </div>
  );
}
