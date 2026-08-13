"use client";

import Link from "next/link";
import { useState } from "react";
import { useSession } from "./providers";
import { MyOrders } from "./trade/my-orders";
import { pct, qty as fq, toneClass, won } from "@/lib/format";
import { RULES } from "@/lib/config";

export function PortfolioView() {
  const { me, account, ready, readOnly, openAccount, busy, setNick, live, loginGoogle } =
    useSession();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");

  if (!ready) {
    return <div className="py-20 text-center text-[13px] text-[var(--color-dim)]">불러오는 중</div>;
  }

  if (readOnly) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <p className="text-[15px] font-semibold">지금은 보기만 됩니다</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-mute)]">
          주문과 잔고를 받아 둘 데이터베이스를 아직 안 붙였습니다. 붙이면 계좌가 열리고 여기에 내
          집과 손익이 쌓입니다
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg border border-[var(--color-line)] px-4 py-2 text-[13px] text-[var(--color-mute)] hover:text-[var(--color-ink)]"
        >
          시장 둘러보기
        </Link>
      </div>
    );
  }

  if (!account || !me) {
    return (
      <div className="py-20 text-center">
        <p className="text-[15px] font-semibold">아직 계좌가 없습니다</p>
        <p className="mt-1.5 text-[13px] text-[var(--color-mute)]">
          계좌를 열면 {won(RULES.SEED_CASH)}원을 드립니다. 그걸로 바로 사고팔 수 있습니다
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          <button
            onClick={() => void openAccount()}
            disabled={busy}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[13.5px] font-semibold text-black hover:brightness-110 disabled:opacity-50"
          >
            계좌 열기
          </button>
          {live && (
            <button
              onClick={() => void loginGoogle()}
              disabled={busy}
              className="rounded-lg border border-[var(--color-line)] px-4 py-2 text-[13.5px] text-[var(--color-mute)] hover:text-[var(--color-ink)] disabled:opacity-50"
            >
              구글로 시작
            </button>
          )}
        </div>
      </div>
    );
  }

  const rate = me.account.seed > 0 ? (me.equity - me.account.seed) / me.account.seed : 0;
  const pnl = me.equity - me.account.seed;

  const save = async () => {
    setErr("");
    try {
      await setNick(draft);
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "이름을 못 바꿨습니다.");
    }
  };

  return (
    <div className="pt-5">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-[20px] font-bold tracking-tight">내 자산</h1>
        {editing ? (
          <span className="flex items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={16}
              autoFocus
              className="w-36 rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] px-2 py-1 text-[13px] outline-none focus:border-[var(--color-line2)]"
            />
            <button
              onClick={() => void save()}
              className="rounded-md bg-[var(--color-panel2)] px-2.5 py-1 text-[12px] hover:text-[var(--color-accent)]"
            >
              저장
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-[12px] text-[var(--color-dim)] hover:text-[var(--color-ink)]"
            >
              취소
            </button>
            {err && <span className="text-[12px] text-up">{err}</span>}
          </span>
        ) : (
          <button
            onClick={() => {
              setDraft(account.nick);
              setEditing(true);
            }}
            className="rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[12px] text-[var(--color-mute)] hover:text-[var(--color-ink)]"
          >
            {account.nick} · 이름 바꾸기
          </button>
        )}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="총 평가액" value={`${won(me.equity)}원`} big />
        <Card label="손익" value={`${pnl >= 0 ? "+" : ""}${won(pnl)}원`} tone={pnl} big />
        <Card label="수익률" value={pct(rate)} tone={rate} big />
        <Card label="예수금" value={`${won(me.account.cash)}원`} />
      </div>

      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-4 py-2.5 text-[12.5px] text-[var(--color-mute)]">
        <span>
          부동산 평가액 <span className="num text-[var(--color-ink)]">{won(me.holdingValue)}</span>원
        </span>
        <span>
          받은 월세 <span className="num text-[var(--color-ink)]">{won(me.account.dividend)}</span>원
        </span>
        <span>
          넣은 돈 <span className="num text-[var(--color-ink)]">{won(me.account.seed)}</span>원
        </span>
        {me.dividendPaid > 0 && (
          <span className="text-[var(--color-accent)]">
            방금 월세 {won(me.dividendPaid)}원이 들어왔습니다
          </span>
        )}
      </div>

      <div className="panel mb-3 overflow-hidden">
        <div className="hidden grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))] gap-2 border-b border-[var(--color-line)] px-4 py-2.5 text-[12px] text-[var(--color-dim)] sm:grid">
          <span>종목</span>
          <span className="text-right">수량</span>
          <span className="text-right">평단가</span>
          <span className="text-right">현재가</span>
          <span className="text-right">평가액</span>
          <span className="text-right">손익</span>
        </div>
        {me.holdings.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-[13px] text-[var(--color-mute)]">아직 가진 집이 없습니다</p>
            <Link
              href="/"
              className="mt-2 inline-block text-[12.5px] text-[var(--color-accent)] hover:underline"
            >
              시장 둘러보기 →
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-line)]">
            {me.holdings.map((h) => (
              <Link
                key={h.symbol}
                href={`/t/${h.symbol}`}
                className="grid grid-cols-3 items-center gap-2 px-4 py-3 transition-colors hover:bg-[var(--color-panel2)] sm:grid-cols-[minmax(0,1.6fr)_repeat(5,minmax(0,1fr))]"
              >
                <div className="col-span-3 min-w-0 sm:col-span-1">
                  <div className="truncate text-[14px] font-semibold">{h.name}</div>
                  {h.locked > 0 && (
                    <div className="text-[11px] text-[var(--color-dim)]">
                      매도 주문에 {fq(h.locked)}주 묶임
                    </div>
                  )}
                </div>
                <span className="num text-right text-[13px]">{fq(h.qty)}주</span>
                <span className="num text-right text-[13px] text-[var(--color-mute)]">
                  {won(h.avgPrice)}
                </span>
                <span className="num text-right text-[13px]">{won(h.price)}</span>
                <span className="num text-right text-[13px]">{won(h.value)}</span>
                <span className={`num text-right text-[13px] font-semibold ${toneClass(h.pnl)}`}>
                  {pct(h.pnlRate)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="h-72">
        <MyOrders />
      </div>
    </div>
  );
}

function Card({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: number;
  big?: boolean;
}) {
  return (
    <div className="panel px-4 py-3">
      <div className="text-[11.5px] text-[var(--color-dim)]">{label}</div>
      <div
        className={`num mt-1 font-bold ${big ? "text-[17px]" : "text-[15px]"} ${
          tone !== undefined ? toneClass(tone) : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}
