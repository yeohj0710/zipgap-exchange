/** 화면에 쓰는 숫자 표기 */

export function won(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return "-";
  return Math.round(v).toLocaleString("ko-KR", { maximumFractionDigits: digits });
}

export function signed(v: number): string {
  const s = won(Math.abs(v));
  if (v > 0) return "+" + s;
  if (v < 0) return "-" + s;
  return s;
}

export function pct(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "-";
  const s = (v * 100).toFixed(digits);
  return (v > 0 ? "+" : "") + s + "%";
}

/** 만원 단위 실물가격을 억/만 으로 읽어 준다 */
export function eok(manwon: number): string {
  if (!Number.isFinite(manwon) || manwon <= 0) return "-";
  const e = Math.floor(manwon / 10000);
  const m = Math.round(manwon % 10000);
  if (e === 0) return `${m.toLocaleString()}만`;
  if (m === 0) return `${e}억`;
  return `${e}억 ${m.toLocaleString()}만`;
}

export function qty(v: number): string {
  return Math.round(v).toLocaleString("ko-KR");
}

export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1_0000_0000) return (v / 1_0000_0000).toFixed(1) + "억";
  if (a >= 1_0000) return Math.round(v / 1_0000).toLocaleString() + "만";
  return won(v);
}

export function timeOf(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(
    2,
    "0"
  )}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function dateOf(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

/** 오르면 빨강, 내리면 파랑 */
export function toneClass(v: number): string {
  if (v > 0) return "text-up";
  if (v < 0) return "text-down";
  return "text-mute";
}
