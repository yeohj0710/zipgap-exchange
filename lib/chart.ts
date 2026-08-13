import { nav } from "./market";
import { mmMid } from "./pricing";
import type { Asset, Candle } from "./types";

/**
 * 차트에 그릴 봉을 만든다.
 *
 * 마켓메이커 기준가는 시각만 넣으면 과거 어느 때든 계산할 수 있다.
 * 그래서 저장한 게 없어도 봉을 그릴 수 있고, 실제 체결이 있었던 구간만
 * 그 위에 덮어쓴다. 거래가 뜸해도 차트가 비지 않는다.
 */

export const TIMEFRAMES = [
  { key: "1m", label: "1분", ms: 60_000, count: 90 },
  { key: "10m", label: "10분", ms: 600_000, count: 90 },
  { key: "1h", label: "1시간", ms: 3_600_000, count: 90 },
  { key: "1d", label: "1일", ms: 86_400_000, count: 120 },
  { key: "1w", label: "1주", ms: 7 * 86_400_000, count: 120 },
] as const;

export type TimeframeKey = (typeof TIMEFRAMES)[number]["key"];

export function timeframe(key: TimeframeKey) {
  return TIMEFRAMES.find((t) => t.key === key) ?? TIMEFRAMES[0];
}

const SAMPLES = 6;

export function candleSeries(
  asset: Asset,
  tfKey: TimeframeKey,
  endMs: number,
  real: Candle[]
): Candle[] {
  const tf = timeframe(tfKey);
  const lastBucket = Math.floor(endMs / tf.ms) * tf.ms;
  const out: Candle[] = [];

  for (let i = tf.count - 1; i >= 0; i--) {
    const t = lastBucket - i * tf.ms;
    let o = 0;
    let h = -Infinity;
    let l = Infinity;
    let c = 0;
    for (let s = 0; s < SAMPLES; s++) {
      const at = t + (tf.ms * s) / SAMPLES;
      const v = mmMid(asset, Math.min(at, endMs), 0);
      if (s === 0) o = v;
      c = v;
      if (v > h) h = v;
      if (v < l) l = v;
    }
    out.push({ t, o, h, l, c, v: 0 });
  }

  // 실제 체결을 해당 구간에 덮어쓴다
  if (real.length) {
    const byBucket = new Map<number, Candle>();
    for (const cd of out) byBucket.set(cd.t, cd);
    const sorted = [...real].sort((a, b) => a.t - b.t);
    for (const rc of sorted) {
      const bucket = Math.floor(rc.t / tf.ms) * tf.ms;
      const target = byBucket.get(bucket);
      if (!target) continue;
      if (target.v === 0) {
        target.o = rc.o;
        target.h = rc.h;
        target.l = rc.l;
      } else {
        target.h = Math.max(target.h, rc.h);
        target.l = Math.min(target.l, rc.l);
      }
      target.c = rc.c;
      target.v += rc.v;
    }
    // 체결이 있던 구간 뒤로는 종가를 이어 준다
    for (let i = 1; i < out.length; i++) {
      if (out[i].v === 0 && out[i - 1].v > 0) {
        const prev = out[i - 1].c;
        const shift = prev / out[i].o;
        if (Number.isFinite(shift) && shift > 0) {
          out[i].o = prev;
          out[i].h = Math.max(out[i].h * shift, prev);
          out[i].l = Math.min(out[i].l * shift, prev);
          out[i].c = out[i].c * shift;
        }
      }
    }
  }

  return out;
}

/** 같은 구간의 기초자산 가치 선 */
export function navSeries(asset: Asset, candles: Candle[]): { t: number; v: number }[] {
  return candles.map((c) => ({ t: c.t, v: nav(asset, c.t) }));
}
