"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/components/providers";
import { RULES, roundToTick, tickSize } from "@/lib/config";
import { qty as fq, won } from "@/lib/format";
import type { Quote } from "@/lib/quote";
import type { Asset, OrderType, Side } from "@/lib/types";

const RATIOS = [0.1, 0.25, 0.5, 1];

export function OrderForm({
  asset,
  quote,
  picked,
  onDone,
}: {
  asset: Asset;
  quote: Quote;
  picked: number | null;
  onDone: () => void;
}) {
  const { account, me, ready, busy, openAccount, api, refresh } = useSession();
  const [side, setSide] = useState<Side>("buy");
  const [type, setType] = useState<OrderType>("limit");
  const [price, setPrice] = useState<number>(0);
  const [count, setCount] = useState<string>("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [sending, setSending] = useState(false);

  const holding = me?.holdings.find((h) => h.symbol === asset.symbol);
  const cash = me?.account.cash ?? 0;
  const sellable = (holding?.qty ?? 0) - (holding?.locked ?? 0);

  useEffect(() => {
    if (price === 0 && quote.price > 0) setPrice(roundToTick(quote.price));
  }, [quote.price, price]);

  useEffect(() => {
    if (picked && picked > 0) {
      setPrice(picked);
      setType("limit");
    }
  }, [picked]);

  const tick = tickSize(price || quote.price || 1);
  const n = Math.max(0, Math.floor(Number(count) || 0));
  const unit = type === "limit" ? price : quote.ask || quote.price;
  const gross = unit * n;
  const fee = Math.floor(gross * RULES.FEE_RATE);
  const total = side === "buy" ? gross + fee : gross - fee;

  const maxBuy = useMemo(() => {
    const u = unit * (1 + RULES.FEE_RATE);
    return u > 0 ? Math.floor(cash / u) : 0;
  }, [cash, unit]);

  const maxQty = side === "buy" ? maxBuy : sellable;

  const submit = async () => {
    setMsg(null);
    if (!account) {
      await openAccount();
      return;
    }
    if (n <= 0) {
      setMsg({ text: "수량을 넣어 주세요.", bad: true });
      return;
    }
    setSending(true);
    try {
      const res = await api<{ result: { message: string } }>("/api/order", {
        method: "POST",
        body: JSON.stringify({
          symbol: asset.symbol,
          side,
          type,
          price: type === "limit" ? price : 0,
          qty: n,
        }),
      });
      setMsg({ text: res.result.message, bad: false });
      setCount("");
      await refresh();
      onDone();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "주문이 안 됐습니다.", bad: true });
    } finally {
      setSending(false);
    }
  };

  const disabled = sending || busy || !ready;

  return (
    <div className="panel flex flex-col overflow-hidden">
      <div className="grid grid-cols-2">
        {(["buy", "sell"] as Side[]).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`py-2.5 text-[13.5px] font-semibold transition-colors ${
              side === s
                ? s === "buy"
                  ? "bg-[color-mix(in_srgb,var(--color-up)_16%,transparent)] text-up"
                  : "bg-[color-mix(in_srgb,var(--color-down)_16%,transparent)] text-down"
                : "text-[var(--color-dim)] hover:text-[var(--color-mute)]"
            }`}
          >
            {s === "buy" ? "사기" : "팔기"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--color-line)] p-3">
        <div className="flex rounded-lg border border-[var(--color-line)] p-0.5">
          {(
            [
              ["limit", "지정가"],
              ["market", "시장가"],
            ] as [OrderType, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setType(k)}
              className={`flex-1 rounded-md py-1.5 text-[12.5px] transition-colors ${
                type === k
                  ? "bg-[var(--color-panel2)] text-[var(--color-ink)]"
                  : "text-[var(--color-dim)] hover:text-[var(--color-mute)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="block">
          <span className="mb-1 block text-[11.5px] text-[var(--color-dim)]">주문 값</span>
          {type === "limit" ? (
            <div className="flex items-center rounded-lg border border-[var(--color-line)] bg-[var(--color-panel2)]">
              <button
                onClick={() => setPrice((p) => Math.max(tick, roundToTick(p - tick, "down")))}
                className="px-3 py-2 text-[var(--color-dim)] hover:text-[var(--color-ink)]"
              >
                −
              </button>
              <input
                type="text"
                inputMode="numeric"
                value={price ? price.toLocaleString("ko-KR") : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9]/g, "");
                  setPrice(raw ? Math.min(Number(raw), 1e9) : 0);
                }}
                onBlur={() => setPrice((p) => roundToTick(p))}
                className="num w-full min-w-0 bg-transparent py-2 text-center text-[15px] font-semibold outline-none"
              />
              <button
                onClick={() => setPrice((p) => roundToTick(p + tick, "up"))}
                className="px-3 py-2 text-[var(--color-dim)] hover:text-[var(--color-ink)]"
              >
                +
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-panel2)] px-3 py-2 text-center text-[13px] text-[var(--color-mute)]">
              지금 나와 있는 호가로 바로 체결
            </div>
          )}
        </label>

        <label className="block">
          <div className="mb-1 flex items-center justify-between text-[11.5px]">
            <span className="text-[var(--color-dim)]">수량</span>
            <span className="num text-[var(--color-dim)]">
              {side === "buy" ? `살 수 있는 최대 ${fq(maxBuy)}주` : `팔 수 있는 ${fq(sellable)}주`}
            </span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            value={count ? Number(count).toLocaleString("ko-KR") : ""}
            onChange={(e) => setCount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="0"
            className="num w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-panel2)] px-3 py-2 text-right text-[15px] font-semibold outline-none placeholder:text-[var(--color-dim)] focus:border-[var(--color-line2)]"
          />
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {RATIOS.map((r) => (
              <button
                key={r}
                onClick={() => setCount(String(Math.floor(maxQty * r)))}
                className="rounded-md border border-[var(--color-line)] py-1 text-[11.5px] text-[var(--color-mute)] hover:border-[var(--color-line2)] hover:text-[var(--color-ink)]"
              >
                {r === 1 ? "최대" : `${r * 100}%`}
              </button>
            ))}
          </div>
        </label>

        <div className="rounded-lg bg-[var(--color-panel2)] px-3 py-2.5 text-[12px]">
          <Line label="주문 금액" value={`${won(gross)}원`} />
          <Line label={`수수료 ${(RULES.FEE_RATE * 100).toFixed(3)}%`} value={`${won(fee)}원`} />
          <div className="my-1.5 border-t border-[var(--color-line)]" />
          <Line
            label={side === "buy" ? "낼 돈" : "받을 돈"}
            value={`${won(total)}원`}
            strong
          />
          {account && (
            <div className="mt-1.5 text-right text-[11px] text-[var(--color-dim)]">
              예수금 <span className="num">{won(cash)}</span>원
            </div>
          )}
        </div>

        {msg && (
          <p className={`text-[12px] ${msg.bad ? "text-up" : "text-[var(--color-mute)]"}`}>
            {msg.text}
          </p>
        )}

        <button
          onClick={() => void submit()}
          disabled={disabled}
          className={`rounded-lg py-2.5 text-[14px] font-bold transition-all disabled:opacity-50 ${
            !account
              ? "bg-[var(--color-accent)] text-black hover:brightness-110"
              : side === "buy"
                ? "bg-[var(--color-up)] text-white hover:brightness-110"
                : "bg-[var(--color-down)] text-white hover:brightness-110"
          }`}
        >
          {!ready
            ? "준비 중"
            : !account
              ? "계좌 열고 시작하기"
              : sending
                ? "보내는 중"
                : side === "buy"
                  ? "사기"
                  : "팔기"}
        </button>
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[var(--color-dim)]">{label}</span>
      <span className={`num ${strong ? "text-[13.5px] font-semibold" : "text-[var(--color-mute)]"}`}>
        {value}
      </span>
    </div>
  );
}
