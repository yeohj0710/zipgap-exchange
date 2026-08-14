// 사이트를 프로덕션으로 올리고, 언제 올렸는지 자국을 남긴다.
//
//   npm run deploy
//
// 자료(listings.json)는 빌드 때 통째로 번들에 들어간다. 루프가 커밋만 하고
// 배포를 안 하면 화면은 옛 자료 그대로다. 그래서 현황판(C:\dev\loop-status.mjs)이
// "자료가 마지막 배포보다 새것이다" 를 말할 수 있게 자국 파일을 남긴다.
// .vercel/project.json 은 배포해도 안 바뀌어서 자국으로 못 쓴다.
import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MARK = resolve(ROOT, "data", ".last_deploy.json");
const DATA = resolve(ROOT, "data", "listings.json");

let result = "fail";
let url = null;
try {
  // Windows 에서 vercel 은 .cmd 라 셸을 태워야 돈다. 고정 문자열이라
  // 끼워넣기 위험이 없다.
  const out = execSync("vercel deploy --prod --yes", {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    timeout: 15 * 60 * 1000,
  });
  process.stdout.write(out);
  url = (out.match(/https:\/\/[^\s"]+\.vercel\.app/) ?? [])[0] ?? null;
  result = "ok";
} catch (e) {
  console.error("배포가 실패했습니다:", e.message);
}

// 현황판이 `at` 을 그대로 잘라 쓴다. UTC 로 적으면 화면에 아홉 시간 이른
// 시각이 뜬다. 우리 시각으로 적는다.
const local = (d = new Date()) => {
  const off = -d.getTimezoneOffset();
  const pad = (n) => String(Math.abs(n)).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${off >= 0 ? "+" : "-"}${pad(off / 60 | 0)}:${pad(off % 60)}`
  );
};

writeFileSync(
  MARK,
  JSON.stringify(
    {
      at: local(),
      result,
      url,
      // 무슨 자료를 올렸는지 같이 적는다. 다음에 볼 때 "이 배포에 그 종목이
      // 들어갔나" 를 파일 시각으로 따지지 않아도 된다.
      listings_at: existsSync(DATA) ? local(statSync(DATA).mtime) : null,
      // 루프가 몇 분마다 listings.json 을 다시 쓴다. 시각만 견주면 내용이 같아도
      // 늘 "배포해야 한다" 가 뜬다. 내용 지문으로 견줘야 진짜 달라진 때만 걸린다.
      listings_sha: existsSync(DATA)
        ? createHash("sha256").update(readFileSync(DATA)).digest("hex").slice(0, 16)
        : null,
    },
    null,
    2
  ) + "\n",
  "utf8"
);

console.log(`\n자국을 남겼습니다: data/.last_deploy.json (${result})`);
if (result !== "ok") process.exit(1);
