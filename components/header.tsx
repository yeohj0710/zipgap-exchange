"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "./providers";
import { compact, pct, toneClass, won } from "@/lib/format";

const NAV = [
  { href: "/", label: "시장" },
  { href: "/portfolio", label: "내 자산" },
  { href: "/rank", label: "랭킹" },
  { href: "/guide", label: "규칙" },
];

export function Header() {
  const path = usePathname();
  const { account, me, ready, live, needsLogin, busy, openAccount, loginGoogle } = useSession();

  const rate = me && me.account.seed > 0 ? (me.equity - me.account.seed) / me.account.seed : 0;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[var(--color-bg)]/92 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center gap-1 px-3 sm:gap-3 sm:px-5">
        <Link href="/" className="mr-1 flex shrink-0 items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-accent)] text-[13px] font-bold text-black">
            집
          </span>
          <span className="hidden text-[15px] font-semibold tracking-tight sm:block">집값거래소</span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
          {NAV.map((n) => {
            const on = n.href === "/" ? path === "/" : path.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-[13px] transition-colors sm:text-sm ${
                  on
                    ? "bg-[var(--color-panel2)] text-[var(--color-ink)]"
                    : "text-[var(--color-mute)] hover:text-[var(--color-ink)]"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        {!ready ? (
          <div className="h-7 w-24 animate-pulse rounded-md bg-[var(--color-panel2)]" />
        ) : account && me ? (
          <Link
            href="/portfolio"
            className="flex shrink-0 items-center gap-2.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 hover:border-[var(--color-line2)]"
          >
            <span className="hidden max-w-[7rem] truncate text-[13px] text-[var(--color-mute)] sm:block">
              {account.nick}
            </span>
            <span className="num hidden text-[13px] font-semibold sm:inline">
              {won(me.equity)}원
            </span>
            <span className="num text-[13px] font-semibold sm:hidden">
              {compact(me.equity)}원
            </span>
            <span className={`num text-[12px] ${toneClass(rate)}`}>{pct(rate)}</span>
          </Link>
        ) : (
          <div className="flex shrink-0 items-center gap-1.5">
            {live && (
              <button
                onClick={() => void loginGoogle()}
                disabled={busy}
                className="rounded-lg border border-[var(--color-line)] px-2.5 py-1.5 text-[13px] text-[var(--color-mute)] hover:text-[var(--color-ink)] disabled:opacity-50"
              >
                구글
              </button>
            )}
            <button
              onClick={() => void openAccount()}
              disabled={busy}
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-semibold text-black hover:brightness-110 disabled:opacity-50"
            >
              {busy ? "여는 중" : needsLogin ? "시작하기" : "계좌 열기"}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
