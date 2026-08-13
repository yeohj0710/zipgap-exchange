"use client";

import { useMemo } from "react";
import { toSharePrice } from "@/lib/market";
import type { Asset } from "@/lib/types";

/** 최근 실거래가 흐름을 작게 보여 준다 */
export function Sparkline({
  asset,
  width = 64,
  height = 26,
  months = 18,
}: {
  asset: Asset;
  width?: number;
  height?: number;
  months?: number;
}) {
  const { d, up } = useMemo(() => {
    const pts = asset.history.slice(-months).map((p) => toSharePrice(asset, p.price));
    if (pts.length < 2) return { d: "", up: true };
    const lo = Math.min(...pts);
    const hi = Math.max(...pts);
    const span = hi - lo || 1;
    const pad = 2;
    const w = width - pad * 2;
    const h = height - pad * 2;
    const d = pts
      .map((v, i) => {
        const x = pad + (i / (pts.length - 1)) * w;
        const y = pad + h - ((v - lo) / span) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { d, up: pts[pts.length - 1] >= pts[0] };
  }, [asset, width, height, months]);

  if (!d) return null;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <path
        d={d}
        fill="none"
        stroke={up ? "var(--color-up)" : "var(--color-down)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}
