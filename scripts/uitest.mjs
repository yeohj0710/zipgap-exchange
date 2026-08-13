// 브라우저에서 실제로 눌러 보고 화면을 찍는다.
//   node scripts/uitest.mjs [baseUrl]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3400";
const OUT = "shots";
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (label, cond, detail = "") => {
  console.log(`  ${cond ? "통과" : "실패"}  ${label}${detail ? "  — " + detail : ""}`);
  if (!cond) failed++;
};

const run = async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 200));
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  console.log(`\n[1] 시장 화면`);
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/1-market.png`, fullPage: true });
  const rows = await page.locator('a[href^="/t/"]').count();
  check("종목 목록 표시", rows >= 18, `${rows}개`);
  const priceText = await page.locator('a[href="/t/EUNMA"]').first().innerText();
  check("값이 채워짐", !priceText.includes("—"), priceText.split("\n").slice(-4).join(" "));

  console.log(`\n[2] 거래 화면`);
  await page.goto(`${BASE}/t/EUNMA`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/2-trade.png`, fullPage: true });
  const candles = await page.locator("svg rect").count();
  check("차트 봉이 그려짐", candles > 30, `${candles}개 도형`);
  const bookRows = await page.locator("button").filter({ hasText: /^[0-9,]+$/ }).count();
  check("호가창 표시", bookRows > 10, `${bookRows}단`);

  console.log(`\n[3] 시장가로 사기`);
  await page.getByRole("button", { name: "시장가", exact: true }).click();
  await page.locator('input[placeholder="0"]').fill("60");
  await page.waitForTimeout(200);
  const buyBtn = page.locator("button", { hasText: /^사기$/ }).last();
  await buyBtn.click();
  await page.waitForTimeout(1800);
  const msg = await page.locator("p.text-\\[12px\\]").allInnerTexts().catch(() => []);
  const panelText = await page.locator(".panel").last().innerText().catch(() => "");
  const bodyText = await page.locator("body").innerText();
  check("체결 안내 표시", /체결했습니다|체결,/.test(bodyText), msg.join(" / ").slice(0, 80));
  check("보유 표시 생김", /내 보유/.test(bodyText));
  await page.screenshot({ path: `${OUT}/3-after-buy.png`, fullPage: true });

  console.log(`\n[4] 지정가 매도 걸기`);
  await page.getByRole("button", { name: "팔기", exact: true }).first().click();
  await page.getByRole("button", { name: "지정가", exact: true }).click();
  const priceInput = page.locator('input[inputmode="numeric"]').first();
  const cur = Number(((await priceInput.inputValue()) || "0").replace(/[^0-9]/g, ""));
  await priceInput.fill(String(Math.round((cur * 1.02) / 25) * 25));
  await page.locator('input[placeholder="0"]').fill("20");
  await page.locator("button", { hasText: /^팔기$/ }).last().click();
  await page.waitForTimeout(1800);
  const body2 = await page.locator("body").innerText();
  check("미체결로 걸림", /걸어 두었습니다/.test(body2));
  check("미체결 1건", /미체결 1/.test(body2));
  await page.screenshot({ path: `${OUT}/4-resting-order.png`, fullPage: true });

  console.log(`\n[5] 주문 취소`);
  await page.getByRole("button", { name: "취소", exact: true }).first().click();
  await page.waitForTimeout(1800);
  const body3 = await page.locator("body").innerText();
  check("미체결 0건으로", /미체결 0/.test(body3));

  console.log(`\n[6] 내 자산 화면`);
  await page.goto(`${BASE}/portfolio`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/5-portfolio.png`, fullPage: true });
  const pf = await page.locator("body").innerText();
  check("보유 종목 표시", /은마아파트/.test(pf));
  check("총 평가액 표시", /총 평가액/.test(pf));

  console.log(`\n[7] 랭킹·규칙`);
  await page.goto(`${BASE}/rank`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/6-rank.png`, fullPage: true });
  check("랭킹에 내가 올라감", /나/.test(await page.locator("body").innerText()));
  await page.goto(`${BASE}/guide`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/7-guide.png`, fullPage: true });

  console.log(`\n[8] 좁은 화면`);
  await ctx.close();
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mp = await mobile.newPage();
  await mp.goto(`${BASE}/t/ARIPARK`, { waitUntil: "networkidle" });
  await mp.waitForTimeout(1500);
  await mp.screenshot({ path: `${OUT}/8-mobile-trade.png`, fullPage: true });
  const overflow = await mp.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check("가로 스크롤 없음", overflow <= 1, `넘침 ${overflow}px`);
  await mp.goto(BASE, { waitUntil: "networkidle" });
  await mp.waitForTimeout(1000);
  await mp.screenshot({ path: `${OUT}/9-mobile-market.png`, fullPage: true });
  const overflow2 = await mp.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  check("시장 화면도 안 넘침", overflow2 <= 1, `넘침 ${overflow2}px`);

  await browser.close();

  const realErrors = errors.filter((e) => !/favicon|Download the React/.test(e));
  check("콘솔 오류 없음", realErrors.length === 0, realErrors.slice(0, 3).join(" || "));

  console.log(failed === 0 ? `\n전부 통과했습니다.\n` : `\n${failed}건 실패했습니다.\n`);
  process.exit(failed === 0 ? 0 : 1);
};

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
