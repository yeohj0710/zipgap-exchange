import { chromium } from 'playwright';
const SS='C:/Users/hjyeo/AppData/Local/Temp/claude/C--/7710678b-dcfc-4d29-84d5-ad25a4a17472/scratchpad/';
const BASE=process.argv[2]||'http://localhost:3400';
const b=await chromium.launch();
for (const theme of ['light','dark']) {
  const ctx=await b.newContext({viewport:{width:1440,height:900}});
  const pg=await ctx.newPage();
  await pg.goto(BASE,{waitUntil:'networkidle',timeout:90000});
  if(theme==='dark'){ await pg.evaluate(()=>localStorage.setItem('zipgap.theme','dark')); await pg.reload({waitUntil:'networkidle'}); }
  await pg.waitForTimeout(1600);
  // 마우스를 세 번째 줄에 올려 hover 표시까지 담는다
  const row=pg.locator('a[href^="/t/"]').nth(2); await row.hover(); await pg.waitForTimeout(250);
  await pg.screenshot({path:SS+`zip-${theme}-home.png`});
  await pg.goto(`${BASE}/t/EUNMA`,{waitUntil:'networkidle'}); await pg.waitForTimeout(1600);
  await pg.screenshot({path:SS+`zip-${theme}-trade.png`});
  await ctx.close();
}
// 토글이 실제로 먹는지, 다시 열어도 남는지
const ctx=await b.newContext({viewport:{width:1440,height:900}});
const pg=await ctx.newPage();
await pg.goto(BASE,{waitUntil:'networkidle'}); await pg.waitForTimeout(1200);
console.log('처음:',await pg.evaluate(()=>document.documentElement.dataset.theme||'light'));
await pg.click('button[aria-label="어두운 화면으로"]'); await pg.waitForTimeout(400);
console.log('누른 뒤:',await pg.evaluate(()=>document.documentElement.dataset.theme),
            '| 저장값:',await pg.evaluate(()=>localStorage.getItem('zipgap.theme')));
await pg.reload({waitUntil:'networkidle'}); await pg.waitForTimeout(1200);
console.log('새로고침 뒤:',await pg.evaluate(()=>document.documentElement.dataset.theme));
await pg.click('button[aria-label="밝은 화면으로"]'); await pg.waitForTimeout(400);
console.log('되돌린 뒤:',await pg.evaluate(()=>document.documentElement.dataset.theme||'light'),
            '| 저장값:',await pg.evaluate(()=>localStorage.getItem('zipgap.theme')));
await b.close();
