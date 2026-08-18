/* 화면 글씨의 대비를 재서 WCAG AA(본문 4.5, 18px 이상 굵은 글씨 3.0) 미달을 찾는다.
     node etc/contrast-audit.mjs [주소] [dark|light]
   색을 고칠 때마다 이걸 다시 돌려라. 260818 첫 측정에서 30%가 미달이었다. */
import { chromium } from "playwright";

const URL = process.argv[2] || "http://localhost:3400";
const THEME = process.argv[3] || "light";

const b = await chromium.launch();
const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
await pg.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
if (THEME === "dark") {
  await pg.evaluate(() => localStorage.setItem("zipgap.theme", "dark"));
  await pg.reload({ waitUntil: "networkidle" });
}
await pg.waitForTimeout(1800);

const rows = await pg.evaluate(() => {
  /* getComputedStyle 이 oklab()·color-mix() 를 그대로 돌려주는 자리가 있다.
     숫자만 뽑아 쓰면 0.97 같은 값을 RGB 로 읽어 새까만 바탕으로 잘못 센다.
     캔버스에 한 번 칠해서 rgb 로 정규화한다. */
  const cv = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const norm = (s) => {
    cv.clearRect(0, 0, 1, 1);
    cv.fillStyle = "#000";
    cv.fillStyle = s;
    cv.fillRect(0, 0, 1, 1);
    const d = cv.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
  const lum = (c) => {
    const [r, g, bl] = c.map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const pageBg = norm(getComputedStyle(document.documentElement).backgroundColor).slice(0, 3);
  const bgOf = (el) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const c = norm(getComputedStyle(e).backgroundColor);
      if (c[3] > 0) {
        stack.push(c);
        if (c[3] === 1) break;
      }
    }
    return stack.reduceRight((acc, c) => over(c, acc), pageBg);
  };

  const out = new Map();
  document.querySelectorAll("*").forEach((el) => {
    const t = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim())
      .join(" ");
    if (!t) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || +cs.opacity === 0) return;
    const fg = over(norm(cs.color), bgOf(el));
    const L1 = lum(fg), L2 = lum(bgOf(el));
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), weight = +cs.fontWeight;
    // 18px 이상, 또는 14px 이상이면서 굵으면 "큰 글씨" 라 3.0 이면 된다
    const need = size >= 18 || (size >= 14 && weight >= 700) ? 3 : 4.5;
    const key = cs.color + "|" + Math.round(size) + "|" + weight;
    const cur = out.get(key) || {
      ratio: +ratio.toFixed(2), need, color: cs.color, size: cs.fontSize, weight, n: 0, sample: "",
    };
    cur.n++;
    if (!cur.sample) cur.sample = t.slice(0, 32);
    out.set(key, cur);
  });
  return [...out.values()].sort((a, b) => a.ratio - b.ratio);
});

console.log(`\n${THEME} — 색/크기별 대비`);
for (const r of rows) {
  const ok = r.ratio >= r.need ? "  " : "!!";
  console.log(
    ok, String(r.ratio).padStart(6), `(기준 ${r.need})`,
    r.color.padEnd(22), (r.size + " w" + r.weight).padEnd(12),
    String(r.n).padStart(4) + "곳", " ", r.sample
  );
}
const bad = rows.filter((r) => r.ratio < r.need);
const all = rows.reduce((s, r) => s + r.n, 0);
const badN = bad.reduce((s, r) => s + r.n, 0);
console.log(`\n기준 미달: ${badN}/${all}곳 (${Math.round((badN / all) * 100)}%)`);
await b.close();
process.exit(bad.length ? 1 : 0);
